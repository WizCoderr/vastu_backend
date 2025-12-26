import { Request, Response } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import { PaymentReducer } from './payment.reducer';
import { Result } from '../core/result';
import logger from '../utils/logger';

export class PaymentIntent {



    static async createRazorpayOrder(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const { courseId } = req.body; // Expect courseId to look up price
            if (!courseId) return res.status(400).json({ error: 'Missing courseId' });

            const result = await PaymentReducer.createRazorpayOrder(req.user.userId, courseId);

            if (result.success) {
                res.json(result.data);
            } else {
                res.status(400).json({ error: result.error });
            }
        } catch (error) {
            console.error('PaymentIntent.createRazorpayOrder Error:', error);
            res.status(500).json({ error: 'Failed to create order' });
        }
    }

    static async verifyRazorpayPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId } = req.body;

            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courseId) {
                return res.status(400).json({ error: 'Missing valid payment details' });
            }

            const result = await PaymentReducer.verifyRazorpayPayment(
                req.user.userId,
                courseId,
                razorpay_order_id,
                razorpay_payment_id,
                razorpay_signature
            );

            if (result.success) {
                res.json({ success: true, paymentId: result.data });
            } else {
                res.status(400).json({ error: result.error });
            }
        } catch (error) {
            console.error('PaymentIntent.verifyRazorpayPayment Error:', error);
            res.status(500).json({ error: 'Verification failed' });
        }
    }
}
