import { Request, Response } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import { PaymentReducer } from './payment.reducer';
import { Result } from '../core/result';
import logger from '../utils/logger';

export class PaymentIntent {
    static async createIntent(req: AuthRequest, res: Response) {
        if (!req.user) {
            logger.warn('PaymentIntent.createIntent: Unauthorized access attempt');
            return res.status(401).json(Result.fail('Unauthorized'));
        }

        const { courseId } = req.body;
        if (!courseId) {
            logger.warn('PaymentIntent.createIntent: Missing courseId', { userId: req.user.userId });
            return res.status(400).json(Result.fail('Course ID is required'));
        }

        logger.info('PaymentIntent.createIntent: Creating payment intent', { userId: req.user.userId, courseId });
        const result = await PaymentReducer.createPaymentIntent(req.user.userId, courseId);

        if (result.success) {
            logger.info('PaymentIntent.createIntent: Payment intent created', { userId: req.user.userId, courseId });
            res.json(result);
        } else {
            logger.error('PaymentIntent.createIntent: Failed to create payment intent', { userId: req.user.userId, courseId, error: result.error });
            res.status(400).json(result);
        }
    }

    static async webhook(req: Request, res: Response) {
        const signature = req.headers['stripe-signature'];

        if (!signature) {
            logger.warn('PaymentIntent.webhook: Missing Stripe signature');
            return res.status(400).send('Missing signature');
        }

        logger.info('PaymentIntent.webhook: Received webhook');

        // Needs raw body for verification. Ensure express app is configured to pass raw body for this route.
        const result = await PaymentReducer.handleWebhook(signature as string, req.body);

        if (result.success) {
            logger.info('PaymentIntent.webhook: Webhook handled successfully');
            res.json({ received: true });
        } else {
            logger.error('PaymentIntent.webhook: Webhook handling failed', { error: result.error });
            res.status(400).send(result.error);
        }
    }
}
