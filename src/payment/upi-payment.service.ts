import { prisma } from '../core/prisma';
import { config } from '../core/config';
import { Result } from '../core/result';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';
import { EmailService } from '../notification/email.service';
import { WhatsAppService } from '../notification/whatsapp.service';
import { WhatsAppMessages } from '../notification/whatsapp.messages';
import { buildUpiUri } from './upi/upi-uri.builder';
import { getAllUpiDeepLinks } from './upi/upi-deep-links';
import { generateQrCodeBase64 } from './upi/qr.service';
import { generateMerchantTxnRef, getPaymentExpiryDate } from './upi/payment-ref.util';
import { enqueuePaymentVerification, enqueueInvoiceGeneration, registerMockPayment } from './jobs/payment-jobs';
import type { ProviderVerificationResult } from './providers/payment-provider.interface';
import { paymentLogger } from '../config/logger';
import {
  getCachedPaymentStatus,
  setCachedPaymentStatus,
  invalidatePaymentStatusCache,
} from './cache/payment-status.cache';
import { withPaymentLock } from './jobs/payment-lock';
import { isPaymentExpired } from './upi/payment-ref.util';

export interface CreateUpiPaymentInput {
  userId: string;
  amount: number;
  description: string;
  type: 'PRODUCT' | 'COURSE';
  orderId?: string;
  courseId?: string;
  studentPaymentId?: string;
}

export class UpiPaymentService {
  static async createPayment(input: CreateUpiPaymentInput) {
    if (input.type === 'PRODUCT' && input.orderId) {
      const existing = await prisma.payment.findFirst({
        where: {
          orderId: input.orderId,
          userId: input.userId,
          status: 'PENDING',
          provider: 'UPI',
        },
      });

      if (
        existing?.merchantTxnRef &&
        existing.upiUrl &&
        existing.qrCodeBase64 &&
        !isPaymentExpired(existing.expiresAt)
      ) {
        await enqueuePaymentVerification(existing.merchantTxnRef, 2000);
        return Result.ok({
          orderId: input.orderId,
          transactionId: existing.merchantTxnRef,
          upiUrl: existing.upiUrl,
          qrCode: existing.qrCodeBase64,
          amount: Number(existing.amount),
          expiresAt: existing.expiresAt,
          reused: true,
        });
      }
    }

    const merchantTxnRef = generateMerchantTxnRef();
    const expiresAt = getPaymentExpiryDate();

    const upiParams = {
      vpa: config.upi.merchantVpa,
      payeeName: config.upi.merchantName,
      transactionRef: merchantTxnRef,
      transactionNote: input.description.slice(0, 80),
      amount: input.amount,
      currency: 'INR',
    };

    const upiUrl = buildUpiUri(upiParams);
    const deepLinks = getAllUpiDeepLinks(upiParams);
    const qrCode = await generateQrCodeBase64(upiUrl);

    registerMockPayment(merchantTxnRef, input.amount);

    if (input.type === 'PRODUCT' && input.orderId) {
      const order = await prisma.order.findUnique({ where: { id: input.orderId } });
      if (!order) return Result.fail('Order not found');
      if (order.userId !== input.userId) return Result.fail('Unauthorized');

      await prisma.payment.upsert({
        where: { orderId: input.orderId },
        update: {
          merchantTxnRef,
          upiUrl,
          qrCodeBase64: qrCode,
          status: 'PENDING',
          provider: 'UPI',
          expiresAt,
          description: input.description,
          amount: order.totalAmount,
        },
        create: {
          userId: input.userId,
          orderId: input.orderId,
          amount: order.totalAmount,
          type: 'PRODUCT',
          provider: 'UPI',
          merchantTxnRef,
          upiUrl,
          qrCodeBase64: qrCode,
          status: 'PENDING',
          expiresAt,
          description: input.description,
        },
      });
    } else if (input.type === 'COURSE' && input.courseId) {
      if (input.studentPaymentId) {
        await prisma.studentPayment.update({
          where: { id: input.studentPaymentId },
          data: {
            merchantTxnRef,
            upiUrl,
            qrCodeBase64: qrCode,
            status: 'PENDING',
            expiresAt,
          },
        });
      } else {
        await prisma.studentPayment.create({
          data: {
            userId: input.userId,
            courseId: input.courseId,
            stageName: 'Full Payment',
            amount: input.amount,
            merchantTxnRef,
            upiUrl,
            qrCodeBase64: qrCode,
            status: 'PENDING',
            expiresAt,
            dueDate: new Date(),
          },
        });
      }
    } else {
      return Result.fail('Invalid payment context');
    }

    await enqueuePaymentVerification(merchantTxnRef);

    paymentLogger.info('UPI payment created', {
      merchantTxnRef,
      userId: input.userId,
      amount: input.amount,
      type: input.type,
    });

    return Result.ok({
      orderId: input.orderId ?? input.courseId,
      transactionId: merchantTxnRef,
      upiUrl,
      qrCode,
      deepLinks,
      expiresAt,
    });
  }

  static async getPaymentStatus(userId: string, transactionId: string) {
    const cached = await getCachedPaymentStatus(transactionId);
    if (cached && cached.userId === userId) {
      return Result.ok(cached);
    }

    const payment = await prisma.payment.findFirst({
      where: { merchantTxnRef: transactionId, userId },
      include: { invoice: true, order: true },
    });

    if (payment) {
      const payload = {
        userId,
        transactionId: payment.merchantTxnRef,
        status: payment.status,
        amount: Number(payment.amount),
        utr: payment.utr,
        orderId: payment.orderId,
        invoiceUrl: payment.invoice?.publicUrl ?? null,
        verifiedAt: payment.verifiedAt,
      };
      await setCachedPaymentStatus(transactionId, payload, payment.status);
      return Result.ok(payload);
    }

    const studentPayment = await prisma.studentPayment.findFirst({
      where: { merchantTxnRef: transactionId, userId },
    });

    if (studentPayment) {
      const status = studentPayment.status === 'PAID' ? 'COMPLETED' : studentPayment.status;
      const payload = {
        userId,
        transactionId: studentPayment.merchantTxnRef,
        status,
        amount: Number(studentPayment.amount),
        utr: studentPayment.utr,
        courseId: studentPayment.courseId,
        verifiedAt: studentPayment.verifiedAt,
      };
      await setCachedPaymentStatus(transactionId, payload, status);
      return Result.ok(payload);
    }

    return Result.fail('Payment not found');
  }

  static async verifyPayment(userId: string, transactionId: string) {
    const payment = await prisma.payment.findFirst({
      where: { merchantTxnRef: transactionId, userId },
    });
    const studentPayment = payment
      ? null
      : await prisma.studentPayment.findFirst({
          where: { merchantTxnRef: transactionId, userId },
        });

    if (!payment && !studentPayment) {
      return Result.fail('Payment not found');
    }

    const { getPaymentProvider } = await import('./providers/provider.factory');
    const provider = getPaymentProvider();
    const result = await provider.verifyPayment(transactionId);

    if (result.status === 'PENDING') {
      await enqueuePaymentVerification(transactionId, 3000);
      return Result.ok({ status: 'PENDING', transactionId });
    }

    await this.applyVerificationResult(transactionId, result);
    return this.getPaymentStatus(userId, transactionId);
  }

  static async applyVerificationResult(
    merchantTxnRef: string,
    result: ProviderVerificationResult,
  ) {
    await withPaymentLock(merchantTxnRef, async () => {
      await this.applyVerificationResultInternal(merchantTxnRef, result);
    });
    await invalidatePaymentStatusCache(merchantTxnRef);
  }

  private static async applyVerificationResultInternal(
    merchantTxnRef: string,
    result: ProviderVerificationResult,
  ) {
    if (result.utr) {
      const existingUtr = await prisma.payment.findFirst({ where: { utr: result.utr } });
      if (existingUtr && existingUtr.merchantTxnRef !== merchantTxnRef) {
        paymentLogger.warn('Duplicate UTR rejected', { utr: result.utr, merchantTxnRef });
        return;
      }
    }

    const payment = await prisma.payment.findFirst({
      where: { merchantTxnRef },
      include: {
        user: true,
        order: { include: { items: { include: { product: true } } } },
      },
    });

    if (payment) {
      if (payment.status === 'COMPLETED') return;

      if (result.status === 'COMPLETED') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: 'COMPLETED',
            utr: result.utr,
            providerPaymentId: result.providerPaymentId,
            providerResponse: result.raw as object,
            verifiedAt: new Date(),
          },
        });

        if (payment.orderId) {
          await prisma.order.update({
            where: { id: payment.orderId },
            data: { status: 'PAID' },
          });
        }

        if (payment.user && payment.order) {
          await EmailService.sendPaymentReceipt({
            receiptId: result.utr ?? merchantTxnRef,
            date: new Date(),
            userName: payment.user.name || 'Customer',
            userEmail: payment.user.email,
            amount: Number(payment.amount),
            items: payment.order.items.map((item) => ({
              name: item.product.name,
              quantity: item.quantity,
              price: Number(item.price),
            })),
            subtotalAmount: Number(payment.order.subtotalAmount),
            bulkDiscount: Number(payment.order.bulkDiscount) > 0 ? Number(payment.order.bulkDiscount) : undefined,
            couponDiscount: Number(payment.order.couponDiscount) > 0 ? Number(payment.order.couponDiscount) : undefined,
          });

          if (payment.order.shippingPhone) {
            await WhatsAppService.queueNotification({
              type: 'ORDER_CONFIRMATION',
              recipientPhone: payment.order.shippingPhone,
              message: WhatsAppMessages.orderConfirmation({
                orderId: payment.order.id,
                totalAmount: Number(payment.amount),
              }),
              referenceId: payment.order.id,
            });
          }

          const { WalletReducer } = await import('../wallet/wallet.reducer');
          void WalletReducer.upsertPendingPassForOrder(payment.order.id, payment.userId);
        }

        await enqueueInvoiceGeneration(payment.id);
      } else if (result.status === 'FAILED') {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: 'Bank verification failed' },
        });
      }
      return;
    }

    const studentPayment = await prisma.studentPayment.findFirst({
      where: { merchantTxnRef },
      include: { user: true, course: true },
    });

    if (!studentPayment || studentPayment.status === 'PAID') return;

    if (result.status === 'COMPLETED') {
      await prisma.studentPayment.update({
        where: { id: studentPayment.id },
        data: {
          status: 'PAID',
          utr: result.utr,
          providerPaymentId: result.providerPaymentId,
          providerResponse: result.raw as object,
          paidAt: new Date(),
          verifiedAt: new Date(),
        },
      });

      let enrollment = await EnrollmentRepository.findEnrollment(
        studentPayment.userId,
        studentPayment.courseId,
      );

      if (!enrollment) {
        enrollment = await EnrollmentRepository.createEnrollment(
          studentPayment.userId,
          studentPayment.courseId,
        );
      }

      await EmailService.sendPaymentReceipt({
        receiptId: result.utr ?? merchantTxnRef,
        date: new Date(),
        userName: studentPayment.user.name || 'Student',
        userEmail: studentPayment.user.email,
        amount: Number(studentPayment.amount),
        courseTitle: studentPayment.course.title,
        serialNumber: enrollment?.serialNumber || undefined,
      });
    } else if (result.status === 'FAILED') {
      await prisma.studentPayment.update({
        where: { id: studentPayment.id },
        data: { status: 'FAILED' },
      });
    }
  }

  static async getPaymentHistory(userId: string) {
    const [productPayments, coursePayments] = await Promise.all([
      prisma.payment.findMany({
        where: { userId },
        include: { invoice: true, order: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      prisma.studentPayment.findMany({
        where: { userId },
        include: { course: true },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
    ]);

    const history = [
      ...productPayments.map((p) => ({
        id: p.id,
        transactionId: p.merchantTxnRef,
        type: p.type,
        amount: Number(p.amount),
        status: p.status,
        utr: p.utr,
        description: p.description,
        createdAt: p.createdAt,
        invoiceUrl: p.invoice?.publicUrl ?? null,
        orderId: p.orderId,
      })),
      ...coursePayments.map((p) => ({
        id: p.id,
        transactionId: p.merchantTxnRef,
        type: 'COURSE' as const,
        amount: Number(p.amount),
        status: p.status === 'PAID' ? 'COMPLETED' : p.status,
        utr: p.utr,
        description: p.stageName,
        createdAt: p.createdAt,
        courseId: p.courseId,
        courseTitle: p.course.title,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return Result.ok(history);
  }

  static async getAdminTransactions(filters?: { status?: string }) {
    const statusFilter = filters?.status?.toUpperCase();

    const payments = await prisma.payment.findMany({
      where: statusFilter ? { status: statusFilter as any } : undefined,
      include: { user: true, order: true, invoice: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return Result.ok(payments);
  }

  static async reconcilePayment(paymentId: string, utr: string, adminUserId: string) {
    const payment = await prisma.payment.findUnique({ where: { id: paymentId } });
    if (!payment) return Result.fail('Payment not found');

    const duplicate = await prisma.payment.findFirst({
      where: { utr, id: { not: paymentId } },
    });
    if (duplicate) return Result.fail('UTR already used');

    await this.applyVerificationResult(payment.merchantTxnRef!, {
      status: 'COMPLETED',
      utr,
      providerPaymentId: `MANUAL-${adminUserId}`,
      raw: { manualReconciliation: true, adminUserId },
    });

    return Result.ok({ success: true });
  }
}
