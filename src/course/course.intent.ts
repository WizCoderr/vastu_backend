import { Request, Response } from 'express';
import { CourseReducer } from './course.reducer';
import { Result } from '../core/result';
import { AuthRequest } from '../core/authMiddleware';
import logger from '../utils/logger';

export class CourseIntent {
    static async listCourses(req: Request, res: Response) {
        logger.info('CourseIntent.listCourses: listing courses');
        const result = await CourseReducer.listCourses();
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
}
