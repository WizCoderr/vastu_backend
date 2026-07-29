import { prisma } from "../core/prisma";
import type { Course, CoursePaymentPlan } from "../generated/prisma/client";

type CourseWithPaymentPlans = Course & { paymentPlans: CoursePaymentPlan[] };

export class EnrollmentRepository {
    static async findEnrollment(userId: string, courseId: string) {
        return prisma.enrollment.findUnique({
            where: {
                userId_courseId: { userId, courseId },
            },
        });
    }

    static async createEnrollment(userId: string, courseId: string) {
     
        const existing = await this.findEnrollment(userId, courseId);
        if (existing) return existing;

        // Generate Serial Number: 001, 002, etc. based on last entry
        const lastEnrollment = await prisma.enrollment.findFirst({
            where: { courseId },
            orderBy: { serialNumber: 'desc' }
        });

        let nextSerial = 1;
        if (lastEnrollment && lastEnrollment.serialNumber) {
            nextSerial = parseInt(lastEnrollment.serialNumber) + 1;
        }
        
        const serialNumber = nextSerial.toString().padStart(3, '0');

        // Calculate expiresAt if course has accessDurationDays
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            select: { accessDurationDays: true }
        });

        let expiresAt: Date | null = null;
        if (course?.accessDurationDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + course.accessDurationDays);
        }

        const enrollment = await prisma.enrollment.create({
            data: {
                userId,
                courseId,
                serialNumber,
                expiresAt,
            },
        });

        await prisma.user.update({
            where: { id: userId },
            data: {
                enrolledCourseIds: {
                    push: courseId
                }
            }
        });

        return enrollment;
    }

    /**
     * Mark a student's course payments as fully PAID (manual/admin offline payment).
     * If the course has installment plans, each stage is upserted to PAID;
     * otherwise a single "Full Payment" row is upserted.
     */
    static async markFullPayment(
        userId: string,
        courseId: string,
        course?: CourseWithPaymentPlans,
    ) {
        const courseData =
            course ??
            (await prisma.course.findUnique({
                where: { id: courseId },
                include: {
                    paymentPlans: { orderBy: { orderIndex: "asc" } },
                },
            }));

        if (!courseData) {
            throw new Error(`Course not found: ${courseId}`);
        }

        const now = new Date();
        const plans = courseData.paymentPlans;

        if (plans.length > 0) {
            for (const plan of plans) {
                const existing = await prisma.studentPayment.findFirst({
                    where: { userId, courseId, planId: plan.id },
                });

                if (existing) {
                    if (existing.status !== "PAID") {
                        await prisma.studentPayment.update({
                            where: { id: existing.id },
                            data: { status: "PAID", paidAt: now },
                        });
                    }
                } else {
                    await prisma.studentPayment.create({
                        data: {
                            userId,
                            courseId,
                            planId: plan.id,
                            stageName: plan.stageName,
                            amount: plan.amount,
                            status: "PAID",
                            paidAt: now,
                            dueDate: now,
                        },
                    });
                }
            }
        } else {
            const existing = await prisma.studentPayment.findFirst({
                where: { userId, courseId },
            });

            if (existing) {
                if (existing.status !== "PAID") {
                    await prisma.studentPayment.update({
                        where: { id: existing.id },
                        data: { status: "PAID", paidAt: now },
                    });
                }
            } else {
                await prisma.studentPayment.create({
                    data: {
                        userId,
                        courseId,
                        planId: null,
                        stageName: "Full Payment",
                        amount: courseData.price,
                        status: "PAID",
                        paidAt: now,
                        dueDate: now,
                    },
                });
            }
        }

        await prisma.enrollment.updateMany({
            where: { userId, courseId, status: { not: "ACTIVE" } },
            data: { status: "ACTIVE" },
        });
    }
}
