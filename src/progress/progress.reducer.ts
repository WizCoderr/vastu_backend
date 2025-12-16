import { prisma } from "../core/prisma";
import { Result } from "../core/result";

export class ProgressReducer {
    static async updateProgress(userId: string, lectureId: string, completed: boolean): Promise<Result<any>> {
        // Verify lecture exists and get course
        const lecture = await prisma.lecture.findUnique({
            where: { id: lectureId },
            include: { section: true },
        });

        if (!lecture) return Result.fail('Lecture not found');

        // Verify Enrollment in the course
        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId: lecture.section.courseId,
                },
            },
        });

        if (!enrollment) return Result.fail('Not enrolled in the course');

        // Update Progress
        const progress = await prisma.progress.upsert({
            where: {
                userId_lectureId: { userId, lectureId },
            },
            update: { completed },
            create: {
                userId,
                lectureId,
                completed,
            },
        });

        return Result.ok(progress);
    }
}
