import { createReadStream, existsSync } from 'fs';
import path from 'path';
import { Response } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import { PaymentReducer } from './payment.reducer';
import { UpiPaymentService } from './upi-payment.service';
import { prisma } from '../core/prisma';
import { config } from '../core/config';

export class PaymentIntent {

    static async createRazorpayOrder(req: AuthRequest, res: Response) {
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

            const result = await PaymentReducer.createRazorpayOrder(req.user.userId, courseId);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Internal order creation error" });
        }
    }

    static async verifyRazorpayPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { transactionId, razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId } = req.body;

            if (config.paymentProvider === 'upi') {
                const txnId = transactionId ?? razorpay_order_id;
                if (!txnId) return res.status(400).json({ error: 'transactionId is required' });
                const result = await UpiPaymentService.verifyPayment(req.user.userId, txnId);
                return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
            }

            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courseId)
                return res.status(400).json({ error: "Incomplete payment details" });

            const result = await PaymentReducer.verifyRazorpayPayment(
                req.user.userId, courseId,
                razorpay_order_id, razorpay_payment_id, razorpay_signature
            );

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

            const result = await PaymentReducer.createRemidiesOrder(req.user.userId, orderId);
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Remidies order payment creation failed" });
        }
    }

    static async verifyRemidiesPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });
        try {
            const { transactionId, razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

            if (config.paymentProvider === 'upi') {
                const txnId = transactionId ?? razorpay_order_id;
                if (!txnId) return res.status(400).json({ error: 'transactionId is required' });
                const result = await UpiPaymentService.verifyPayment(req.user.userId, txnId);
                return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
            }

            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId)
                return res.status(400).json({ error: "Incomplete payment details" });

            const result = await PaymentReducer.verifyRemidiesPayment(
                req.user.userId, orderId, razorpay_order_id, razorpay_payment_id, razorpay_signature
            );
            return result.success ? res.json(result.data) : res.status(400).json({ error: result.error });
        } catch {
            res.status(500).json({ error: "Remidies payment verification failed" });
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
            const { paymentId } = req.params;
            const result = await PaymentReducer.payInstallment(req.user.userId, paymentId);
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
                { method: "POST", path: "/api/payments/create", description: "Create UPI payment" },
                { method: "POST", path: "/api/payments/verify", description: "Verify UPI payment" },
                { method: "GET", path: "/api/payments/status/:transactionId", description: "Get payment status" },
                { method: "GET", path: "/api/payments/history", description: "Payment history" },
                { method: "POST", path: "/api/payments/course/order", description: "Create course payment" },
                { method: "POST", path: "/api/payments/course/verify", description: "Verify course payment" },
                { method: "POST", path: "/api/payments/remidies/order", description: "Create shop payment" },
                { method: "POST", path: "/api/payments/remidies/verify", description: "Verify shop payment" },
            ],
            admin: [
                { method: "GET", path: "/api/payments/admin/transactions", description: "UPI transactions" },
                { method: "POST", path: "/api/payments/admin/reconcile", description: "Manual UTR reconcile" },
                { method: "GET", path: "/api/payments/admin/export", description: "Export CSV" },
                { method: "GET", path: "/api/payments/admin/all", description: "Unified payments view" },
            ],
        };
        res.json({ success: true, data: apis });
    }
}
