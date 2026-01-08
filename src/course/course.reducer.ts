import { prisma } from "../core/prisma";
import { Result } from '../core/result';
import { CourseDto } from './course.dto';

export class CourseReducer {
    static async listCourses(): Promise<Result<CourseDto[]>> {
        const courses = await prisma.course.findMany({
            include: {
                sections: {
                    include: {
                        lectures: true,
                        liveClasses: {
                            where: { status: { in: ['SCHEDULED', 'LIVE'] } },
                            orderBy: { scheduledAt: 'asc' }
                        }
                    }
                },
                courseResources: true,
                liveClasses: {
                    where: {
                        status: { in: ['SCHEDULED', 'LIVE'] },
                        scheduledAt: { gte: new Date() }
                    },
                    orderBy: { scheduledAt: 'asc' },
                    take: 5
                }
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
                }))),
                liveClasses: s.liveClasses?.map(lc => ({
                    id: lc.id,
                    title: lc.title,
                    description: lc.description,
                    scheduledAt: lc.scheduledAt,
                    durationMinutes: lc.durationMinutes,
                    status: lc.status,
                    meetingUrl: lc.meetingUrl,
                    sectionId: lc.sectionId
                }))
            }))),
            resources: await Promise.all(c.courseResources
                .filter(r => r.type === 'FREE')
                .map(async (r) => ({
                    id: r.id,
                    title: r.title,
                    type: r.type,
                    url: r.s3Key ? await getPresignedReadUrl(r.s3Key, r.s3Bucket || undefined).catch(() => '') : ''
                }))
            ),
            liveClasses: c.liveClasses ? c.liveClasses.map(lc => ({
                id: lc.id,
                title: lc.title,
                description: lc.description,
                scheduledAt: lc.scheduledAt,
                durationMinutes: lc.durationMinutes,
                status: lc.status,
                meetingUrl: lc.meetingUrl
            })) : undefined
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
                                lectures: true,
                                liveClasses: {
                                    where: { status: { in: ['SCHEDULED', 'LIVE'] } },
                                    orderBy: { scheduledAt: 'asc' }
                                }
                            }
                        },
                        courseResources: true,
                        liveClasses: {
                            where: {
                                status: { in: ['SCHEDULED', 'LIVE'] },
                                scheduledAt: { gte: new Date() }
                            },
                            orderBy: { scheduledAt: 'asc' },
                            take: 5
                        }
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
                }))),
                liveClasses: s.liveClasses?.map(lc => ({
                    id: lc.id,
                    title: lc.title,
                    description: lc.description,
                    scheduledAt: lc.scheduledAt,
                    durationMinutes: lc.durationMinutes,
                    status: lc.status,
                    meetingUrl: lc.meetingUrl,
                    sectionId: lc.sectionId
                }))
            }))),
            resources: await Promise.all(c.courseResources
                .map(async (r) => ({
                    id: r.id,
                    title: r.title,
                    type: r.type,
                    url: r.s3Key ? await getPresignedReadUrl(r.s3Key, r.s3Bucket || undefined).catch(() => '') : ''
                }))
            ),
            liveClasses: c.liveClasses ? c.liveClasses.map(lc => ({
                id: lc.id,
                title: lc.title,
                description: lc.description,
                scheduledAt: lc.scheduledAt,
                durationMinutes: lc.durationMinutes,
                status: lc.status,
                meetingUrl: lc.meetingUrl
            })) : undefined
        })));

        return Result.ok(dtos);
    }

    static async getCourseDetail(courseId: string, userId?: string): Promise<Result<CourseDto>> {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: {
                sections: {
                    include: {
                        lectures: true,
                        liveClasses: {
                            where: { status: { in: ['SCHEDULED', 'LIVE'] } },
                            orderBy: { scheduledAt: 'asc' }
                        }
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
            }))),
            liveClasses: s.liveClasses?.map(lc => ({
                id: lc.id,
                title: lc.title,
                description: lc.description,
                scheduledAt: lc.scheduledAt,
                durationMinutes: lc.durationMinutes,
                status: lc.status,
                meetingUrl: lc.meetingUrl,
                sectionId: lc.sectionId
            }))
        })));

        const resources = await Promise.all(course.courseResources.map(async (r) => {
            const url = r.s3Key
                ? await getPresignedReadUrl(r.s3Key, r.s3Bucket || undefined).catch(() => '')
                : '';

            return {
                id: r.id,
                title: r.title,
                url,
                type: r.type
            };
        }));

        // Count the students enrolled in this course
        // Count the students enrolled in this course
        const studentCount = await prisma.enrollment.count({ where: { courseId } });

        // Fetch live classes for ALL users (Public & Authenticated)
        const liveClasses = await prisma.liveClass.findMany({
            where: {
                courseId: courseId,
                status: { in: ['SCHEDULED', 'LIVE'] }, // Only future/live classes
                scheduledAt: { gte: new Date() } // Optional: ensure they are in the future
            },
            orderBy: { scheduledAt: 'asc' },
            take: 5
        });

        return Result.ok({
            ...course,
            price: Number(course.price),
            thumbnail: signedThumbnail,
            isEnrolled: !!enrollment,
            studentCount,
            sections: sectionsWithSignedUrls,
            resources,
            liveClasses: liveClasses.length > 0 ? liveClasses : undefined
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
