import { prisma } from "../core/prisma";
import { Result } from '../core/result';
import { CourseDto } from './course.dto';

export class CourseReducer {
    static async listCourses(): Promise<Result<CourseDto[]>> {
        const courses = await prisma.course.findMany({
            include: {
                sections: {
                    include: {
                        lectures: true
                    }
                },
                courseResources: true
            }
        });
        const { getPresignedReadUrl, getDirectS3Url } = await import('../core/s3Service');

        // Map Decimal to number for DTO & Sign URLs
        const dtos = await Promise.all(courses.map(async (c) => ({
            ...c,
            price: Number(c.price),
            thumbnail: c.s3Key ? await getDirectS3Url(c.s3Key, c.s3Bucket || undefined).catch(() => c.thumbnail) : c.thumbnail,
            // number of students enrolled
            studentCount: await prisma.enrollment.count({ where: { courseId: c.id } }),
            sections: await Promise.all(c.sections.map(async (s) => ({
                id: s.id,
                title: s.title,
                lectures: await Promise.all(s.lectures.map(async (l) => ({
                    id: l.id,
                    title: l.title,
                    videoUrl: l.s3Key ? await getPresignedReadUrl(l.s3Key, l.s3Bucket || undefined).catch(() => l.videoUrl) : l.videoUrl,
                    videoProvider: l.videoProvider
                })))
            }))),
            resources: await Promise.all(c.courseResources
                .filter(r => r.type === 'FREE')
                .map(async (r) => ({
                    id: r.id,
                    title: r.title,
                    type: r.type,
                    url: r.s3Key ? await getPresignedReadUrl(r.s3Key, r.s3Bucket || undefined).catch(() => '') : ''
                }))
            )
        })));

        return Result.ok(dtos);
    }

    static async listEnrolledCourses(userId: string): Promise<Result<CourseDto[]>> {
        const enrollments = await prisma.enrollment.findMany({
            where: { userId },
            include: {
                course: {
                    include: {
                        sections: {
                            include: {
                                lectures: true
                            }
                        },
                        courseResources: true
                    }
                }
            },
        });

        const courses = enrollments.map(e => e.course);

        const { getPresignedReadUrl, getDirectS3Url } = await import('../core/s3Service');

        // Map Decimal to number for DTO & Sign URLs
        const dtos = await Promise.all(courses.map(async (c) => ({
            ...c,
            price: Number(c.price),
            thumbnail: c.s3Key ? await getDirectS3Url(c.s3Key, c.s3Bucket || undefined).catch(() => c.thumbnail) : c.thumbnail,
            // number of students enrolled
            studentCount: await prisma.enrollment.count({ where: { courseId: c.id } }),
            sections: await Promise.all(c.sections.map(async (s) => ({
                id: s.id,
                title: s.title,
                lectures: await Promise.all(s.lectures.map(async (l) => ({
                    id: l.id,
                    title: l.title,
                    videoUrl: l.s3Key ? await getPresignedReadUrl(l.s3Key, l.s3Bucket || undefined).catch(() => l.videoUrl) : l.videoUrl,
                    videoProvider: l.videoProvider
                })))
            }))),
            resources: await Promise.all(c.courseResources
                .map(async (r) => ({
                    id: r.id,
                    title: r.title,
                    type: r.type,
                    url: r.s3Key ? await getPresignedReadUrl(r.s3Key, r.s3Bucket || undefined).catch(() => '') : ''
                }))
            )
        })));

        return Result.ok(dtos);
    }

    static async getCourseDetail(courseId: string, userId?: string): Promise<Result<CourseDto>> {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: {
                sections: {
                    include: {
                        lectures: true
                    }
                },
                courseResources: true
            }
        });

        if (!course) return Result.fail('Course not found');

        let enrollment = null;
        if (userId) {
            enrollment = await prisma.enrollment.findUnique({
                where: {
                    userId_courseId: {
                        userId,
                        courseId,
                    },
                },
            });
        }

        const { getPresignedReadUrl, getDirectS3Url } = await import('../core/s3Service');
        const signedThumbnail = course.s3Key
            ? await getDirectS3Url(course.s3Key, course.s3Bucket || undefined).catch(() => course.thumbnail)
            : course.thumbnail;

        const sectionsWithSignedUrls = await Promise.all(course.sections.map(async (s) => ({
            id: s.id,
            title: s.title,
            lectures: await Promise.all(s.lectures.map(async (l) => ({
                id: l.id,
                title: l.title,
                videoUrl: l.s3Key ? await getPresignedReadUrl(l.s3Key, l.s3Bucket || undefined).catch(() => l.videoUrl) : l.videoUrl,
                videoProvider: l.videoProvider
            })))
        })));

        const resources = await Promise.all(course.courseResources.map(async (r) => {
            const isInstructor = userId ? userId === course.instructorId : false;
            // Access control: if PAID and not (enrolled OR instructor), hide it.
            // If userId is missing, enrollment & isInstructor are false/null, so PAID is hidden.
            if (r.type === 'PAID' && !enrollment && !isInstructor) {
                return null;
            }
            const url = r.s3Key ? await getPresignedReadUrl(r.s3Key, r.s3Bucket || undefined).catch(() => '') : '';
            return {
                id: r.id,
                title: r.title,
                url,
                type: r.type
            };
        }));
        const validResources = resources.filter((r): r is NonNullable<typeof r> => r !== null);

        // Count the students enrolled in this course
        const studentCount = await prisma.enrollment.count({ where: { courseId } });

        return Result.ok({
            ...course,
            price: Number(course.price),
            thumbnail: signedThumbnail,
            isEnrolled: !!enrollment,
            studentCount,
            sections: sectionsWithSignedUrls,
            resources: validResources
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

        const { getPresignedReadUrl } = await import('../core/s3Service');

        const sectionsWithSignedUrls = await Promise.all(sections.map(async (s) => ({
            ...s,
            lectures: await Promise.all(s.lectures.map(async (l) => ({
                ...l,
                videoUrl: l.s3Key ? await getPresignedReadUrl(l.s3Key, l.s3Bucket || undefined).catch(() => l.videoUrl) : l.videoUrl
            })))
        })));

        return Result.ok(sectionsWithSignedUrls);
    }
    static async validateLectureAccess(lectureId: string, userId: string, role: string): Promise<Result<any>> {
        const lecture = await prisma.lecture.findUnique({
            where: { id: lectureId },
            include: { section: { include: { course: { include: { enrollments: { where: { userId } } } } } } }
        });

        if (!lecture) {
            return Result.fail('Lecture not found');
        }

        const enrollments = lecture.section.course.enrollments;
        const isInstructor = lecture.section.course.instructorId === userId;
        const isAdmin = role === 'admin';

        if (enrollments.length === 0 && !isInstructor && !isAdmin) {
            return Result.fail('You are not enrolled in this course');
        }

        return Result.ok(lecture);
    }
}
