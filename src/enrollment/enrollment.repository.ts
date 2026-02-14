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

        // Generate Serial Number: 001, 002, etc. based on course enrollment count
        const count = await prisma.enrollment.count({
            where: { courseId }
        });
        const serialNumber = (count + 1).toString().padStart(3, '0');

        const enrollment = await prisma.enrollment.create({
            data: {
                userId,
                courseId,
                serialNumber,
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
