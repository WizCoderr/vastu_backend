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
        // Public access allowed, optionally authenticated
        // User might not be populated if not logged in

        const userId = req.user?.userId;

        logger.info('CourseIntent.getCourse: Fetching course details', { courseId: id, userId: userId || 'public' });
        const result = await CourseReducer.getCourseDetail(id, userId);

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
            const accessResult = await CourseReducer.validateLectureAccess(lectureId, req.user.userId, req.user.role);
            if (!accessResult.success) {
                // Determine strict status code based on error message or default to 403
                const status = accessResult.error === 'Lecture not found' ? 404 : 403;
                return res.status(status).json(accessResult);
            }
            const lecture = accessResult.data;

            // Handle S3 Playback
            if (lecture.s3Key) {
                const { getPresignedReadUrl } = await import('../core/s3Service');
                const signedUrl = await getPresignedReadUrl(lecture.s3Key, lecture.s3Bucket || undefined);

                return res.json({
                    success: true,
                    url: signedUrl,
                    provider: 's3'
                });
            } else {
                // Legacy Fallback (should not be reached for new content)
                return res.status(422).json(Result.fail('Video provider not supported or missing S3 key'));
            }

        } catch (error: any) {
            logger.error('CourseIntent.getLectureStreamUrl: Error', { error });
            return res.status(500).json(Result.fail('Failed to get stream URL'));
        }
    }
}
