import { Response } from "express";
import { AuthRequest } from "../core/authMiddleware";
import { PaymentReducer } from "./payment.reducer";

export class PaymentIntent {

    static async createRazorpayOrder(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { courseId } = req.body;
            if (!courseId) return res.status(400).json({ error: "courseId is required" });

            const result = await PaymentReducer.createRazorpayOrder(req.user.userId, courseId);

            return result.success
                ? res.json(result.data)
                : res.status(400).json({ error: result.error });

        } catch {
            res.status(500).json({ error: "Internal order creation error" });
        }
    }

    static async verifyRazorpayPayment(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json({ error: "Unauthorized" });

        try {
            const { razorpay_order_id, razorpay_payment_id, razorpay_signature, courseId } = req.body;

            if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !courseId)
                return res.status(400).json({ error: "Incomplete payment details" });

            const result = await PaymentReducer.verifyRazorpayPayment(
                req.user.userId, courseId,
                razorpay_order_id, razorpay_payment_id, razorpay_signature
            );

            return result.success
                ? res.json({ success: true, paymentId: result.data })
                : res.status(400).json({ error: result.error });

        } catch {
            res.status(500).json({ error: "Payment verification failed" });
        }
    }
}
