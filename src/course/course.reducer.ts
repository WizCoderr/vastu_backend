import { prisma } from "../core/prisma";
import { Result } from '../core/result';
import { CourseDto } from './course.dto';
import { mapCourseSections, sectionOrderBy, sortSectionsByOrder, withSectionIndex } from './section.utils';

export class CourseReducer {
    static async listCourses(): Promise<Result<CourseDto[]>> {
        const courses = await prisma.course.findMany({
            where: { isVisible: true },
            orderBy: { id: 'desc' },
            include: {
                sections: {
                    orderBy: sectionOrderBy,
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
        const { resolveThumbnailUrl, resolveResourceUrl, resolveMediaUrl } = await import('../core/cloudinaryService');

        // Map Decimal to number for DTO & resolve media URLs
        const dtos = await Promise.all(courses.map(async (c) => {
            return {
                id: c.id,
                title: c.title,
                description: c.description,
                price: Number(c.price),
                instructorId: c.instructorId,
                thumbnail: await resolveThumbnailUrl(c.thumbnail, c.s3Key, c.s3Bucket) || c.thumbnail,
                studentCount: await prisma.enrollment.count({ where: { courseId: c.id } }),
                sections: await mapCourseSections(c.sections, (l) =>
                    resolveMediaUrl(l.videoUrl, l.s3Key, l.s3Bucket, 'video').then((url) => url || l.videoUrl)
                ),
                resources: await Promise.all(c.courseResources
                    .map(async (r) => ({
                        id: r.id,
                        title: r.title,
                        type: r.type,
                        url: r.s3Key ? await resolveResourceUrl(r.s3Key, r.s3Bucket).catch(() => '') : ''
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
            };
        }));

        return Result.ok(dtos);
    }

    static async listEnrolledCourses(userId: string): Promise<Result<CourseDto[]>> {
        const now = new Date();
        const enrollments = await prisma.enrollment.findMany({
            where: { 
                userId,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: now } }
                ]
            },
            include: {
                course: {
                    include: {
                        sections: {
                            orderBy: sectionOrderBy,
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

        const { resolveThumbnailUrl, resolveResourceUrl, resolveMediaUrl } = await import('../core/cloudinaryService');

        // Map Decimal to number for DTO & resolve media URLs
        const dtos = await Promise.all(enrollments.map(async (e) => {
            const c = e.course;
            return {
                id: c.id,
                title: c.title,
                description: c.description,
                price: Number(c.price),
                instructorId: c.instructorId,
                thumbnail: await resolveThumbnailUrl(c.thumbnail, c.s3Key, c.s3Bucket) || c.thumbnail,
                isEnrolled: true,
                serialNumber: e.serialNumber,
                // number of students enrolled
                studentCount: await prisma.enrollment.count({ where: { courseId: c.id } }),
                sections: await mapCourseSections(c.sections, (l) =>
                    resolveMediaUrl(l.videoUrl, l.s3Key, l.s3Bucket, 'video').then((url) => url || l.videoUrl)
                ),
                resources: await Promise.all(c.courseResources
                    .map(async (r) => ({
                        id: r.id,
                        title: r.title,
                        type: r.type,
                        url: r.s3Key ? await resolveResourceUrl(r.s3Key, r.s3Bucket).catch(() => '') : ''
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
            };
        }));

        return Result.ok(dtos);
    }

    static async getCourseDetail(courseId: string, userId?: string): Promise<Result<CourseDto>> {
        const course = await prisma.course.findUnique({
            where: { id: courseId },
            include: {
                sections: {
                    orderBy: sectionOrderBy,
                    include: {
                        lectures: true,
                        liveClasses: {
                            where: { status: { in: ['SCHEDULED', 'LIVE'] } },
                            orderBy: { scheduledAt: 'asc' }
                        }
                    }
                },
                courseResources: true,
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

        const { resolveThumbnailUrl, resolveResourceUrl, resolveMediaUrl } = await import('../core/cloudinaryService');
        const signedThumbnail = await resolveThumbnailUrl(course.thumbnail, course.s3Key, course.s3Bucket) || course.thumbnail;

        const sectionsWithSignedUrls = await mapCourseSections(course.sections, (l) =>
            resolveMediaUrl(l.videoUrl, l.s3Key, l.s3Bucket, 'video').then((url) => url || l.videoUrl)
        );

        const resources = await Promise.all(course.courseResources.map(async (r) => {
            const url = r.s3Key
                ? await resolveResourceUrl(r.s3Key, r.s3Bucket).catch(() => '')
                : '';

            return {
                id: r.id,
                title: r.title,
                url,
                type: r.type
            };
        }));

        const studentCount = await prisma.enrollment.count({ where: { courseId } });

        const liveClasses = await prisma.liveClass.findMany({
            where: {
                courseId: courseId,
                status: { in: ['SCHEDULED', 'LIVE'] },
                scheduledAt: { gte: new Date() }
            },
            orderBy: { scheduledAt: 'asc' },
            take: 5
        });

        return Result.ok({
            id: course.id,
            title: course.title,
            description: course.description,
            price: Number(course.price),
            instructorId: course.instructorId,
            thumbnail: signedThumbnail,
            isEnrolled: !!enrollment,
            serialNumber: enrollment?.serialNumber || null,
            studentCount,
            sections: sectionsWithSignedUrls,
            resources,
            liveClasses: liveClasses.length > 0 ? liveClasses : undefined
        });
    }

    static async getCurriculum(courseId: string, userId: string): Promise<Result<any>> {
        const enrollment = await prisma.enrollment.findUnique({
            where: {
                userId_courseId: { userId, courseId },
            },
        });

        if (!enrollment) {
            return Result.fail('Access denied: You are not enrolled in this course');
        }

        const sections = await prisma.section.findMany({
            where: { courseId },
            orderBy: sectionOrderBy,
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

        const { resolveMediaUrl } = await import('../core/cloudinaryService');

        const sectionsWithSignedUrls = await Promise.all(
            sortSectionsByOrder(sections).map(async (s, i) =>
                withSectionIndex({
                    ...s,
                    lectures: await Promise.all(s.lectures.map(async (l) => ({
                        ...l,
                        videoUrl: l.s3Key
                            ? await resolveMediaUrl(l.videoUrl, l.s3Key, l.s3Bucket, 'video').then((url) => url || l.videoUrl)
                            : l.videoUrl,
                    }))),
                }, i + 1)
            )
        );

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
        const courseEndDate = lecture.section.course.endDate;
        const now = new Date();

        if (enrollments.length === 0 && !isInstructor && !isAdmin) {
            return Result.fail('You are not enrolled in this course');
        }

        if (enrollments.length > 0) {
            const enrollment = enrollments[0];
            
            // Check for explicit expiration
            if (enrollment.expiresAt && now > enrollment.expiresAt && !isAdmin && !isInstructor) {
                return Result.fail('Access denied: Your access to this course has expired.');
            }

            if (enrollment.status === 'PAYMENT_DUE') {
                 return Result.fail('Access restricted: Payment overdue. Please complete your pending payment.');
            }
        }

        if (courseEndDate && now > courseEndDate && !isAdmin && !isInstructor) {
            return Result.fail('Access denied: This course has expired.');
        }

        return Result.ok(lecture);
    }
}
