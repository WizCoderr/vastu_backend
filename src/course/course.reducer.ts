import { prisma } from "../core/prisma";
import { Result } from '../core/result';
import { CourseDto } from './course.dto';

export class CourseReducer {
    static async listCourses(): Promise<Result<CourseDto[]>> {
        const courses = await prisma.course.findMany();
        const { getPresignedReadUrl } = await import('../core/s3Service');

        // Map Decimal to number for DTO & Sign URLs
        const dtos = await Promise.all(courses.map(async (c) => ({
            ...c,
            price: Number(c.price),
            thumbnail: c.s3Key ? await getPresignedReadUrl(c.s3Key, c.s3Bucket || undefined).catch(() => c.thumbnail) : c.thumbnail
        })));

        return Result.ok(dtos);
    }

    static async listEnrolledCourses(userId: string): Promise<Result<CourseDto[]>> {
        const enrollments = await prisma.enrollment.findMany({
            where: { userId },
            include: { course: true },
        });

        const courses = enrollments.map(e => e.course);

        const { getPresignedReadUrl } = await import('../core/s3Service');

        // Map Decimal to number for DTO
        const dtos = await Promise.all(courses.map(async (c) => ({
            ...c,
            price: Number(c.price),
            thumbnail: c.s3Key ? await getPresignedReadUrl(c.s3Key, c.s3Bucket || undefined).catch(() => c.thumbnail) : c.thumbnail
        })));

        return Result.ok(dtos);
    }

    static async getCourseDetail(courseId: string, userId: string): Promise<Result<CourseDto>> {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
        });

        if (!course) return Result.fail('Course not found');

        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: {
                    userId,
                    courseId,
                },
            },
        });

        const { getPresignedReadUrl } = await import('../core/s3Service');
        const signedThumbnail = course.s3Key
            ? await getPresignedReadUrl(course.s3Key, course.s3Bucket || undefined).catch(() => course.thumbnail)
            : course.thumbnail;

        return Result.ok({
            ...course,
            price: Number(course.price),
            thumbnail: signedThumbnail,
            isEnrolled: !!enrollment,
        });
    }

    static async getCurriculum(courseId: string, userId: string): Promise<Result<any>> {
        // 1. Check Enrollment
        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: { userId, courseId },
            },
        });

        if (!enrollment) {
            return Result.fail('Access denied: You are not enrolled in this course');
        }

        // 2. Fetch Curriculum
        const sections = await prisma.section.findMany({
            where: { courseId },
            include: {
                lectures: {
                    include: {
                        progress: {
                            where: { userId },
                        },
                    },
                },
            },
        });

        return Result.ok(sections);
    }
}
