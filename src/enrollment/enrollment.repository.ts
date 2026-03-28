import { prisma } from "../core/prisma";

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
}
