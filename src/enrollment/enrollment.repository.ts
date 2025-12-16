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
        // Idempotent creation (Add-only)
        // Using upsert or ignore if exists, but requirements say "Enrollment is ADD-ONLY"
        // and "Enrollment has UNIQUE(userId, courseId)"

        // Check first to avoid error or use try/catch
        const existing = await this.findEnrollment(userId, courseId);
        if (existing) return existing;

        return prisma.enrollment.create({
            data: {
                userId,
                courseId,
            },
        });
    }
}
