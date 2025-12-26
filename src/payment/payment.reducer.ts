import { prisma } from "../core/prisma";

import { config } from '../core/config';
import { Result } from '../core/result';
import { EnrollmentRepository } from '../enrollment/enrollment.repository';



export class PaymentReducer {



    // --- Razorpay Methods ---

    static async createRazorpayOrder(userId: string, courseId: string): Promise<Result<{ orderId: string, amount: number, currency: string, keyId: string }>> {
        // 1. Verify Course
        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return Result.fail('Course not found');
        if (!course.published) return Result.fail('Course is not available');

        // 2. Check if already enrolled
        const existingEnrollment = await EnrollmentRepository.findEnrollment(userId, courseId);
        if (existingEnrollment) return Result.fail('Already enrolled in this course');

        // 3. Create Order
        const amount = Number(course.price);
        try {
            const { createRazorpayOrder } = await import('../core/razorpayService');
            // Receipt can be local payment ID placeholder or userId-timestamp
            const receipt = `rcpt_${userId}_${Date.now()}`;
            const order = await createRazorpayOrder(amount, 'INR', receipt);

            return Result.ok({
                orderId: order.id,
                amount: Number(order.amount),
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID || ''
            });
        } catch (error: any) {
            return Result.fail(`Razorpay order creation failed: ${error.message}`);
        }
    }

    static async verifyRazorpayPayment(userId: string, courseId: string, razorpayOrderId: string, razorpayPaymentId: string, razorpaySignature: string): Promise<Result<string>> {
        try {
            const { verifyRazorpaySignature } = await import('../core/razorpayService');
            const isValid = verifyRazorpaySignature(razorpayOrderId, razorpayPaymentId, razorpaySignature);

            if (!isValid) return Result.fail('Invalid signature');

            // 1. Create Payment Record
            const payment = await prisma.payment.create({
                data: {
                    userId,
                    courseId,
                    amount: "0", // Ideally fetch from course or order history
                    status: 'COMPLETED',
                    providerId: null, // Legacy Stripe field
                    razorpayOrderId: razorpayOrderId,
                    razorpayPaymentId: razorpayPaymentId,
                    razorpaySignature: razorpaySignature
                }
            });

            // 2. Create Enrollment
            await EnrollmentRepository.createEnrollment(userId, courseId);

            return Result.ok(payment.id);
        } catch (error: any) {
            if (error.code === 'P2002') {
                return Result.ok('Already enrolled'); // Idempotency
            }
            return Result.fail(`Verification failed: ${error.message}`);
        }
    }
}
