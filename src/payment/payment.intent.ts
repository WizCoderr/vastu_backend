import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { Response } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import { PaymentReducer } from './payment.reducer';
import { UpiPaymentService } from './upi-payment.service';
import { prisma } from '../core/prisma';
import { config } from '../core/config';
import type { PayuChannel, PayuResponsePayload } from '../core/payuService';

function resolveChannel(req: AuthRequest): PayuChannel {
  const raw =
    (req.body?.channel as string | undefined) ||
    (req.headers['x-client-channel'] as string | undefined) ||
    '';
  return raw.toLowerCase() === 'app' ? 'app' : 'web';
}

function formPayload(body: unknown): PayuResponsePayload {
  if (!body || typeof body !== 'object') return {};
  const out: PayuResponsePayload = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    if (value == null) continue;
    out[key] = Array.isArray(value) ? String(value[0]) : String(value);
  }
  return out;
}

export class PaymentIntent {

    static async createCourseOrder(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { courseId } = req.body;
            if (!courseId) return res.status(400).json({ error: "courseId is required" });

            if (config.paymentProvider === 'upi') {
                const course = await prisma.course.findUnique({ where: { id: courseId } });
                if (!course) return res.status(400).json({ error: 'Course not found' });

                const result = await UpiPaymentService.createPayment({
                    userId: req.user.userId,
                    amount: Number(course.price),
                    description: course.title,
                    type: 'COURSE',
                    courseId,
                });
                return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
            }

            const result = await PaymentReducer.createCoursePayuPayment(
                req.user.userId,
                courseId,
                resolveChannel(req),
            );
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Internal order creation error" });
        }
    }

    /** Client verify / status poll — PayU S2S or UPI depending on PAYMENT_PROVIDER */
    static async verifyCoursePayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { transactionId, txnid, courseId } = req.body;

            if (config.paymentProvider === 'upi') {
                const txnId = transactionId ?? txnid;
                if (!txnId) return res.status(400).json({ error: 'transactionId is required' });
                const result = await UpiPaymentService.verifyPayment(req.user.userId, txnId);
                return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
            }

            const id = txnid || transactionId;
            if (!id) return res.status(400).json({ error: "txnid is required" });

            const result = await PaymentReducer.getPayuStatus(req.user.userId, id);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Payment verification failed" });
        }
    }

    static async createRemidiesOrder(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { orderId } = req.body;
            if (!orderId) return res.status(400).json({ error: "orderId is required" });

            if (config.paymentProvider === 'upi') {
                const order = await prisma.order.findUnique({ where: { id: orderId } });
                if (!order) return res.status(400).json({ error: 'Order not found' });

                const result = await UpiPaymentService.createPayment({
                    userId: req.user.userId,
                    amount: Number(order.totalAmount),
                    description: `Order ${orderId.slice(0, 8)}`,
                    type: 'PRODUCT',
                    orderId,
                });
                return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
            }

            const result = await PaymentReducer.createRemidiesOrder(
                req.user.userId,
                orderId,
                resolveChannel(req),
            );
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Remidies order payment creation failed" });
        }
    }

    static async verifyRemidiesPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { transactionId, txnid } = req.body;

            if (config.paymentProvider === 'upi') {
                const txnId = transactionId ?? txnid;
                if (!txnId) return res.status(400).json({ error: 'transactionId is required' });
                const result = await UpiPaymentService.verifyPayment(req.user.userId, txnId);
                return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
            }

            const id = txnid || transactionId;
            if (!id) return res.status(400).json({ error: "txnid is required" });

            const result = await PaymentReducer.getPayuStatus(req.user.userId, id);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Remidies payment verification failed" });
        }
    }

    static async handlePayuCallback(req: any, res: Response) {
        try {
            const payload = formPayload(req.body);
            const result = await PaymentReducer.processPayuResponse(payload);
            const txnid = String(payload.txnid ?? '');
            const status = String(payload.status ?? '').toLowerCase();
            const amount = String(payload.amount ?? '');
            const kind = String(payload.udf2 ?? '').toUpperCase();
            const refId = String(payload.udf3 ?? '');
            const mihpayid = String(payload.mihpayid ?? '');
            const channel = String(payload.udf1 ?? '').toLowerCase();

            const success =
                result.success &&
                (status === 'success' || status === 'captured') &&
                !(result.data as any)?.status?.toString().includes('FAILED');

            // Flutter CheckoutPro WebView: HTML 200 ack (302 to SPA breaks the SDK)
            if (channel === 'app') {
                const title = success ? 'Payment successful' : 'Payment failed';
                const detail = success
                    ? 'You can close this window and return to the app.'
                    : String((result as any).error || payload.error_Message || status || 'failed');
                const safe = detail.replace(/[<>&]/g, '');
                res.status(200).type('html').send(`<!DOCTYPE html>
<html><head><meta charset="utf-8"/><title>${title}</title>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
</head><body style="font-family:sans-serif;padding:24px;text-align:center">
<h1>${title}</h1><p>${safe}</p>
<p style="color:#666;font-size:12px">txnid: ${txnid}</p>
</body></html>`);
                return;
            }

            const base = config.payu.webReturnUrl;

            if (success) {
                const qs = new URLSearchParams({
                    txnid,
                    transactionId: mihpayid || txnid,
                    amount,
                    status: 'success',
                });
                if (kind === 'PRODUCT' && refId) qs.set('orderId', refId);
                if (kind === 'COURSE' && refId) qs.set('courseId', refId);
                return res.redirect(302, `${base}/payment/success?${qs.toString()}`);
            }

            const reason = encodeURIComponent(
                (result as any).error ||
                    String(payload.error_Message || payload.error || status || 'failed'),
            );
            const qs = new URLSearchParams({
                txnid,
                reason,
                status: 'failure',
            });
            if (kind === 'PRODUCT' && refId) qs.set('orderId', refId);
            if (kind === 'COURSE' && refId) qs.set('courseId', refId);
            return res.redirect(302, `${base}/payment/failure?${qs.toString()}`);
        } catch (error: any) {
            const channel = String(req.body?.udf1 ?? '').toLowerCase();
            if (channel === 'app') {
                const msg = String(error.message || 'callback_error').replace(/[<>&]/g, '');
                return res
                    .status(200)
                    .type('html')
                    .send(`<!DOCTYPE html><html><body><h1>Payment error</h1><p>${msg}</p></body></html>`);
            }
            const base = config.payu.webReturnUrl;
            return res.redirect(
                302,
                `${base}/payment/failure?reason=${encodeURIComponent(error.message || 'callback_error')}`,
            );
        }
    }

    static async handlePayuWebhook(req: any, res: Response) {
        try {
            const payload = formPayload(req.body);
            const result = await PaymentReducer.processPayuResponse(payload);
            if (!result.success) {
                return res.status(400).json({ error: result.error });
            }
            return res.json({ success: true, data: result.data });
        } catch (error: any) {
            return res.status(400).json({ error: error.message || 'Webhook failed' });
        }
    }

    static async generatePayuHash(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { txnid, hashName, hashString, hashType, postSalt } = req.body || {};
            const result = await PaymentReducer.generatePayuSdkHash(req.user.userId, {
                txnid,
                hashName,
                hashString,
                hashType,
                postSalt,
            });
            return result.success
                ? res.json(result.data)
                : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Hash generation failed' });
        }
    }

    static async getPayuStatus(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { txnid } = req.params;
            if (!txnid) return res.status(400).json({ error: 'txnid is required' });
            const result = await PaymentReducer.getPayuStatus(req.user.userId, txnid);
            return result.success
                ? res.json(result.data)
                : res.status(404).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Failed to fetch PayU status' });
        }
    }

    static async refundPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const paymentId = String(req.params.paymentId || req.body?.paymentId || '');
            if (!paymentId) return res.status(400).json({ error: 'paymentId is required' });
            const result = await PaymentReducer.refundPayuPayment(paymentId, req.user.userId);
            return result.success
                ? res.json({ success: true, data: result.data })
                : res.status(400).json({ error: result.error });
        } catch (error: any) {
            res.status(500).json({ error: error.message || 'Refund failed' });
        }
    }

    static async createPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { amount, description, orderId, courseId } = req.body;
            if (!amount || !description) {
                return res.status(400).json({ error: 'amount and description are required' });
            }

            const result = await UpiPaymentService.createPayment({
                userId: req.user.userId,
                amount: Number(amount),
                description,
                type: orderId ? 'PRODUCT' : 'COURSE',
                orderId,
                courseId,
            });

            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Payment creation failed' });
        }
    }

    static async verifyPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { transactionId } = req.body;
            if (!transactionId) return res.status(400).json({ error: 'transactionId is required' });

            const result = await UpiPaymentService.verifyPayment(req.user.userId, transactionId);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Payment verification failed' });
        }
    }

    static async getPaymentStatus(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { transactionId } = req.params;
            const result = await UpiPaymentService.getPaymentStatus(req.user.userId, transactionId);
            return result.success ? res.json(result.data) : res.status(404).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Failed to fetch payment status' });
        }
    }

    static async getPaymentHistory(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const result = await UpiPaymentService.getPaymentHistory(req.user.userId);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Failed to fetch payment history' });
        }
    }

    static async downloadInvoice(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { id } = req.params;
            const payment = await prisma.payment.findFirst({
                where: { id, userId: req.user.userId },
                include: { invoice: true },
            });

            if (!payment?.invoice) {
                return res.status(404).json({ error: 'Invoice not found' });
            }

            const filePath = path.resolve(payment.invoice.filePath);
            if (!existsSync(filePath)) {
                return res.status(404).json({ error: 'Invoice file missing' });
            }

            res.setHeader('Content-Type', 'application/pdf');
            res.setHeader('Content-Disposition', `attachment; filename="${payment.invoice.invoiceNumber}.pdf"`);
            createReadStream(filePath).pipe(res);
        } catch {
            res.status(500).json({ error: 'Failed to download invoice' });
        }
    }

    static async getAdminTransactions(req: AuthRequest, res: Response) {
        try {
            const status = req.query.status as string | undefined;
            const result = await UpiPaymentService.getAdminTransactions({ status });
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Failed to fetch transactions' });
        }
    }

    static async reconcilePayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
        try {
            const { paymentId, utr } = req.body;
            if (!paymentId || !utr) return res.status(400).json({ error: 'paymentId and utr are required' });

            const result = await UpiPaymentService.reconcilePayment(paymentId, utr, req.user.userId);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: 'Reconciliation failed' });
        }
    }

    static async exportTransactions(req: AuthRequest, res: Response) {
        try {
            const result = await UpiPaymentService.getAdminTransactions();
            if (!result.success) return res.status(400).json({ error: result.error });

            const rows = (result.data as any[]).map((p) => ({
                id: p.id,
                transactionId: p.merchantTxnRef,
                utr: p.utr,
                amount: p.amount,
                status: p.status,
                customer: p.user?.name,
                email: p.user?.email,
                createdAt: p.createdAt,
            }));

            res.setHeader('Content-Type', 'text/csv');
            res.setHeader('Content-Disposition', 'attachment; filename="transactions.csv"');
            const header = 'id,transactionId,utr,amount,status,customer,email,createdAt\n';
            const body = rows.map((r) =>
                [r.id, r.transactionId, r.utr, r.amount, r.status, r.customer, r.email, r.createdAt].join(',')
            ).join('\n');
            res.send(header + body);
        } catch {
            res.status(500).json({ error: 'Export failed' });
        }
    }

    static async getAllCoursePayments(req: AuthRequest, res: Response) {
        try {
            const result = await PaymentReducer.getAllCoursePayments();
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Failed to fetch course payments" });
        }
    }

    static async getAllRemidiesPayments(req: AuthRequest, res: Response) {
        try {
            const result = await PaymentReducer.getAllRemidiesPayments();
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Failed to fetch remedies payments" });
        }
    }

    static async getAllPayments(req: AuthRequest, res: Response) {
        try {
            const result = await PaymentReducer.getCentralizedPayments();
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Failed to fetch centralized payments" });
        }
    }

    static async getCoursePaymentPlan(req: AuthRequest, res: Response) {
        try {
            const { courseId } = req.params;
            const result = await PaymentReducer.getCoursePaymentPlan(courseId);
            return result.success ? res.json(result.data) : res.status(400).json(result);
        } catch {
            res.status(500).json({ error: "Failed to fetch plan" });
        }
    }

    static async getStudentPayments(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { courseId } = req.params;
            const result = await PaymentReducer.getStudentPayments(req.user.userId, courseId);
            return result.success ? res.json(result.data) : res.status(400).json(result);
        } catch {
            res.status(500).json({ error: "Failed to fetch student payments" });
        }
    }

    static async payInstallment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const paymentId =
                (req.params.paymentId as string | undefined) ||
                (req.body?.paymentId as string | undefined);
            if (!paymentId) {
                return res.status(400).json({ error: "paymentId is required" });
            }
            const result = await PaymentReducer.payInstallment(
                req.user.userId,
                paymentId,
                resolveChannel(req),
            );
            return result.success ? res.json(result.data) : res.status(400).json(result);
        } catch {
            res.status(500).json({ error: "Failed to initiate installment payment" });
        }
    }

    static async freeEnroll(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { courseId } = req.body;
            if (!courseId) return res.status(400).json({ error: "courseId is required" });

            const result = await PaymentReducer.freeEnroll(req.user.userId, courseId);
            return result.success
                ? res.json({ success: true })
                : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Free enrollment failed" });
        }
    }

    static async getPaymentApis(req: any, res: Response) {
        const apis = {
            student: [
                { method: "POST", path: "/api/payments/course/order", description: "Create PayU course payment" },
                { method: "POST", path: "/api/payments/course/verify", description: "Poll/reconcile course payment status" },
                { method: "GET", path: "/api/payments/course/plan/:courseId", description: "Course installment plan" },
                { method: "GET", path: "/api/payments/plan/:courseId", description: "Course installment plan (alias)" },
                { method: "GET", path: "/api/payments/course/:courseId/my-payments", description: "Student course payments" },
                { method: "POST", path: "/api/payments/course/installment/:paymentId", description: "Pay installment via PayU" },
                { method: "POST", path: "/api/payments/installment/order", description: "Pay installment via PayU (body.paymentId)" },
                { method: "POST", path: "/api/payments/remidies/order", description: "Create PayU shop payment" },
                { method: "POST", path: "/api/payments/remidies/verify", description: "Poll/reconcile shop payment status" },
                { method: "POST", path: "/api/payments/payu/callback", description: "PayU surl/furl browser callback" },
                { method: "POST", path: "/api/payments/payu/webhook", description: "PayU server-to-server webhook" },
                { method: "POST", path: "/api/payments/payu/hash", description: "Generate CheckoutPro SDK hash" },
                { method: "GET", path: "/api/payments/payu/status/:txnid", description: "PayU payment status" },
                { method: "POST", path: "/api/payments/create", description: "Create UPI payment (legacy)" },
                { method: "POST", path: "/api/payments/verify", description: "Verify UPI payment (legacy)" },
            ],
            admin: [
                { method: "GET", path: "/api/payments/admin/transactions", description: "Online / PayU transactions" },
                { method: "POST", path: "/api/payments/admin/reconcile", description: "Manual UTR reconcile" },
                { method: "POST", path: "/api/payments/admin/refund/:paymentId", description: "Refund a completed PayU payment" },
                { method: "GET", path: "/api/payments/admin/export", description: "Export CSV" },
                { method: "GET", path: "/api/payments/admin/all", description: "Unified payments view" },
            ],
        };
        res.json({ success: true, data: apis });
    }
}
