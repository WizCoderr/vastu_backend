import { createWriteStream } from 'fs';
import { mkdir as mkdirAsync } from 'fs/promises';
import path from 'path';
import PDFDocument from 'pdfkit';
import { prisma } from '../../core/prisma';
import { config } from '../../core/config';

const INVOICE_DIR = path.join(process.cwd(), 'storage', 'invoices');

export class InvoiceNumberService {
  static async nextInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const prefix = `INV-${year}-`;
    const latest = await prisma.invoice.findFirst({
      where: { invoiceNumber: { startsWith: prefix } },
      orderBy: { createdAt: 'desc' },
      select: { invoiceNumber: true },
    });

    const lastSeq = latest
      ? Number.parseInt(latest.invoiceNumber.replace(prefix, ''), 10)
      : 0;

    return `${prefix}${String(lastSeq + 1).padStart(6, '0')}`;
  }
}

export class InvoiceService {
  static async generateForPayment(paymentId: string) {
    const existing = await prisma.invoice.findUnique({ where: { paymentId } });
    if (existing) return existing;

    const payment = await prisma.payment.findUnique({
      where: { id: paymentId },
      include: { user: true, order: true },
    });

    if (!payment || payment.status !== 'COMPLETED') {
      throw new Error('Payment not eligible for invoice');
    }

    await mkdirAsync(INVOICE_DIR, { recursive: true });

    const invoiceNumber = await InvoiceNumberService.nextInvoiceNumber();
    const fileName = `${invoiceNumber}.pdf`;
    const filePath = path.join(INVOICE_DIR, fileName);
    const publicUrl = `${config.upi.invoiceBaseUrl}/api/payments/invoices/${paymentId}/download`;

    await new Promise<void>((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50 });
      const stream = createWriteStream(filePath);
      doc.pipe(stream);

      doc.fontSize(20).text('WizHub / Vastu Arun Sharma', { align: 'center' });
      doc.moveDown();
      doc.fontSize(14).text(`Invoice: ${invoiceNumber}`);
      doc.text(`Date: ${new Date().toLocaleDateString('en-IN')}`);
      doc.moveDown();
      doc.text(`Customer: ${payment.user.name ?? 'Customer'}`);
      doc.text(`Email: ${payment.user.email}`);
      doc.moveDown();
      doc.text(`Transaction ID: ${payment.merchantTxnRef ?? payment.id}`);
      if (payment.utr) doc.text(`UTR: ${payment.utr}`);
      doc.moveDown();
      doc.text(`Amount: INR ${Number(payment.amount).toFixed(2)}`);
      if (payment.description) doc.text(`Description: ${payment.description}`);
      doc.moveDown(2);
      doc.text('Thank you for your payment.', { align: 'center' });

      doc.end();
      stream.on('finish', () => resolve());
      stream.on('error', reject);
    });

    return prisma.invoice.create({
      data: {
        invoiceNumber,
        paymentId,
        filePath,
        publicUrl,
      },
    });
  }
}
