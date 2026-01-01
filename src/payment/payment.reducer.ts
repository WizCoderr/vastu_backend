import { prisma } from "../core/prisma";
import { Result } from "../core/result";
import { EnrollmentRepository } from "../enrollment/enrollment.repository";

export class PaymentReducer {

    static async createRazorpayOrder(userId: string, courseId: string) {
        const course = await prisma.course.findUnique({ where: { id: courseId } });
        if (!course) return Result.fail("Course not found");
        if (!course.published) return Result.fail("Course is not available");

        const exists = await EnrollmentRepository.findEnrollment(userId, courseId);
        if (exists) return Result.fail("Already enrolled");

        try {
            const { createRazorpayOrder } = await import("../core/razorpayService");

            // RECEIPT <= 40 CHAR SAFE
            const shortUser = userId.substring(0, 8);
            const receipt = `rcpt_${shortUser}_${Date.now().toString().slice(-6)}`;

            const order = await createRazorpayOrder(Number(course.price), "INR", receipt);

            return Result.ok({
                orderId: order.id,
                amount: order.amount,
                currency: order.currency,
                keyId: process.env.RAZORPAY_KEY_ID
            });

        } catch (error: any) {
            return Result.fail(`Razorpay order creation failed: ${error.message}`);
        }
    }

    static async verifyRazorpayPayment(userId: string, courseId: string, orderId: string, paymentId: string, signature: string) {
        try {
            const { verifyRazorpaySignature } = await import("../core/razorpayService");
            const valid = verifyRazorpaySignature(orderId, paymentId, signature);
            if (!valid) return Result.fail("Invalid payment signature");

            const course = await prisma.course.findUnique({ where: { id: courseId } });
            if (!course) return Result.fail("Course not found");

            const payment = await prisma.payment.create({
                data: {
                    userId,
                    courseId,
                    amount: course.price,
                    status: "COMPLETED",
                    razorpayOrderId: orderId,
                    razorpayPaymentId: paymentId,
                    razorpaySignature: signature
                }
            });

            await EnrollmentRepository.createEnrollment(userId, courseId);

            return Result.ok(payment.id);

        } catch (error: any) {
            if (error.code === "P2002") return Result.ok("Already enrolled");
            return Result.fail(`Verification failed: ${error.message}`);
        }
    }

    static async getAllPayments() {
        const payments = await prisma.payment.findMany({
            select: {
                id: true,
                userId: true,
                courseId: true,
                amount: true,
                status: true,
                createdAt: true,
            },
            orderBy: { createdAt: 'desc' }
        });

        return Result.ok({ payments: payments });
    }
}
``