import { Request, Response } from 'express';
import { CourseReducer } from './course.reducer';
import { Result } from '../core/result';
import { AuthRequest } from '../core/authMiddleware';
import logger from '../utils/logger';
import { prisma } from '../core/prisma';

export class CourseIntent {
    static async listCourses(req: Request, res: Response) {
        logger.info('CourseIntent.listCourses: listing courses');
        const result = await CourseReducer.listCourses();
        res.json(result);
    }

    static async listEnrolledCourses(req: AuthRequest, res: Response) {
        if (!req.user) {
            return res.status(401).json(Result.fail('Unauthorized'));
        }

        logger.info('CourseIntent.listEnrolledCourses: listing enrolled courses', { userId: req.user.userId });
        const result = await CourseReducer.listEnrolledCourses(req.user.userId);
        res.json(result);
    }

    static async getCourse(req: AuthRequest, res: Response) {
        const { id } = req.params;
        // We can allow viewing details without auth, but getUser if available?
        // Requirement said: "STUDENT (JWT PROTECTED)" for these routes.
        // So we assume req.user is populated by middleware.

        if (!req.user) {
            logger.warn('CourseIntent.getCourse: Unauthorized access attempt', { courseId: id });
            return res.status(401).json(Result.fail('Unauthorized'));
        }

        logger.info('CourseIntent.getCourse: Fetching course details', { courseId: id, userId: req.user.userId });
        const result = await CourseReducer.getCourseDetail(id, req.user.userId);

        if (result.success) {
            return res.json(result);
        } else {
            logger.warn('CourseIntent.getCourse: Course not found or failed', { courseId: id, error: result.error });
            return res.status(404).json(result);
        }
    }

    static async getCurriculum(req: AuthRequest, res: Response) {
        const { id } = req.params;
        if (!req.user) {
            logger.warn('CourseIntent.getCurriculum: Unauthorized access attempt', { courseId: id });
            return res.status(401).json(Result.fail('Unauthorized'));
        }

        logger.info('CourseIntent.getCurriculum: Fetching curriculum', { courseId: id, userId: req.user.userId });
        const result = await CourseReducer.getCurriculum(id, req.user.userId);

        if (result.success) {
            res.json(result);
        } else {
            logger.warn('CourseIntent.getCurriculum: Failed to fetch curriculum', { courseId: id, error: result.error });
            res.status(403).json(result);
        }
    }

    static async getLectureStreamUrl(req: AuthRequest, res: Response) {
        const { lectureId } = req.params;
        if (!req.user) {
            return res.status(401).json(Result.fail('Unauthorized'));
        }

        logger.info('CourseIntent.getLectureStreamUrl: requesting stream', { lectureId, userId: req.user.userId });

        try {
            // Check enrollment first (using Reducer or Prisma directly)
            // Ideally we use a reducer for enrollment check. Let's assume we can query prisma here for speed/simplicity
            // or we reuse existing pattern. Since CourseReducer seems to handle logic, let's peek at it,
            // but for now I'll do a direct check or use a helper if available.
            // Given the context, I'll use prisma directly for this specific new flow to ensure exact logic.

            const lecture = await prisma.lecture.findUnique({
                where: { id: lectureId },
                include: { section: { include: { course: { include: { enrollments: { where: { userId: req.user.userId } } } } } } }
            });

            if (!lecture) {
                return res.status(404).json(Result.fail('Lecture not found'));
            }

            // Check enrollment
            const enrollments = lecture.section.course.enrollments;
            const isInstructor = lecture.section.course.instructorId === req.user.userId;
            const isAdmin = req.user.role === 'admin';

            if (enrollments.length === 0 && !isInstructor && !isAdmin) {
                return res.status(403).json(Result.fail('You are not enrolled in this course'));
            }

            // Handle Mux vs Cloudinary
            if (lecture.videoProvider === 'mux' || lecture.videoProvider === 's3-mux') {
                if (!lecture.muxPlaybackId) {
                    return res.status(422).json(Result.fail('Video is processing or not ready'));
                }

                // Dynamically import to avoid top-level side effects if env vars missing during other flows
                const { signMuxPlaybackId } = await import('../core/muxService');
                const signedUrl = await signMuxPlaybackId(lecture.muxPlaybackId);

                return res.json({
                    success: true,
                    url: signedUrl,
                    provider: 'mux'
                });
            } else {
                // Cloudinary (Default)
                return res.json({
                    success: true,
                    url: lecture.videoUrl,
                    provider: 'cloudinary'
                });
            }

        } catch (error: any) {
            logger.error('CourseIntent.getLectureStreamUrl: Error', { error });
            return res.status(500).json(Result.fail('Failed to get stream URL'));
        }
    }
}
