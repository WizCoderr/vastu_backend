import { prisma } from "../core/prisma";
import { Stripe } from 'stripe';
import { config } from '../core/config';
import { Result } from '../core/result';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';

const stripe = new Stripe(config.stripeSecretKey || '', { apiVersion: '2025-01-27.acacia' as any }); // Force cast or use valid string if known, using any to avoid conflict for now or just remove apiVersion strict check

export class PaymentReducer {
    static async createPaymentIntent(userId: string, courseId: string): Promise<Result<{ clientSecret: string; paymentId: string }>> {
        // 1. Verify Course and Price
        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return Result.fail('Course not found');
        if (!course.published) return Result.fail('Course is not available');

        // 2. Check if already enrolled
        const existingEnrollment = await EnrollmentRepository.findEnrollment(userId, courseId);
        if (existingEnrollment) return Result.fail('Already enrolled in this course');

        // 3. Create Stripe Payment Intent
        // Use course price. Stripe expects amounts in cents if currency is usd/eur etc.
        // Assuming price is in standard units (e.g. $10.00), multiply by 100.
        const amountInCents = Math.round(Number(course.price) * 100);

        try {
            const intent = await stripe.paymentIntents.create({
                amount: amountInCents,
                currency: 'usd',
                metadata: { userId, courseId },
                automatic_payment_methods: { enabled: true },
            });

            // 4. Create local Payment record
            const payment = await prisma.payment.create({
                data: {
                    userId,
                    courseId,
                    amount: course.price,
                    status: 'PENDING',
                    providerId: intent.id,
                },
            });

            return Result.ok({
                clientSecret: intent.client_secret!,
                paymentId: payment.id,
            });
        } catch (error: any) {
            return Result.fail(`Payment initialization failed: ${error.message}`);
        }
    }

    static async handleWebhook(signature: string, rawBody: Buffer): Promise<Result<string>> {
        let event: Stripe.Event;

        try {
            event = stripe.webhooks.constructEvent(
                rawBody,
                signature,
                config.stripeWebhookSecret || ''
            );
        } catch (err: any) {
            return Result.fail(`Webhook signature verification failed: ${err.message}`);
        }

        if (event.type === 'payment_intent.succeeded') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            const { userId, courseId } = paymentIntent.metadata;

            if (userId && courseId) {
                // 1. Update Payment Status
                await prisma.payment.updateMany({
                    where: { providerId: paymentIntent.id },
                    data: { status: 'COMPLETED' },
                });

                // 2. Create Enrollment
                await EnrollmentRepository.createEnrollment(userId, courseId);

                return Result.ok('Enrollment created');
            }
        } else if (event.type === 'payment_intent.payment_failed') {
            const paymentIntent = event.data.object as Stripe.PaymentIntent;
            await prisma.payment.updateMany({
                where: { providerId: paymentIntent.id },
                data: { status: 'FAILED' },
            });
        }

        return Result.ok('Event processed');
    }
}
