import { prisma } from "../core/prisma";
import { Result } from '../core/result';
import { CourseDto } from './course.dto';

export class CourseReducer {
    static async listCourses(): Promise<Result<CourseDto[]>> {
        const courses = await prisma.course.findMany();

        // Map Decimal to number for DTO
        const dtos = courses.map(c => ({
            ...c,
            price: Number(c.price),
        }));

        return Result.ok(dtos);
    }

    static async listEnrolledCourses(userId: string): Promise<Result<CourseDto[]>> {
        const enrollments = await prisma.enrollment.findMany({
            where: { userId },
            include: { course: true },
        });

        const courses = enrollments.map(e => e.course);

        // Map Decimal to number for DTO
        const dtos = courses.map(c => ({
            ...c,
            price: Number(c.price),
        }));

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

        return Result.ok({
            ...course,
            price: Number(course.price),
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
