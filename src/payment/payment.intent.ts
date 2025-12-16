import { Request, Response } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import { PaymentReducer } from './payment.reducer';
import { Result } from '../core/result';

export class PaymentIntent {
    static async createIntent(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json(Result.fail('Unauthorized'));

        const { courseId } = req.body;
        if (!courseId) return res.status(400).json(Result.fail('Course ID is required'));

        const result = await PaymentReducer.createPaymentIntent(req.user.userId, courseId);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    }

    static async webhook(req: Request, res: Response) {
        const signature = req.headers['stripe-signature'];

        if (!signature) {
            return res.status(400).send('Missing signature');
        }

        // Needs raw body for verification. Ensure express app is configured to pass raw body for this route.
        const result = await PaymentReducer.handleWebhook(signature as string, req.body);

        if (result.success) {
            res.json({ received: true });
        } else {
            res.status(400).send(result.error);
        }
    }
}
