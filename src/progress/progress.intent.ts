import { Response } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import { progressUpdateSchema } from '../course/course.dto';
import { ProgressReducer } from './progress.reducer';
import { Result } from '../core/result';
import logger from '../utils/logger';

export class ProgressIntent {
    static async updateProgress(req: AuthRequest, res: Response) {
        if (!req.user) {
            logger.warn('ProgressIntent.updateProgress: Unauthorized access attempt');
            return res.status(401).json(Result.fail('Unauthorized'));
        }

        const validation = progressUpdateSchema.safeParse(req.body);
        if (!validation.success) {
            logger.warn('ProgressIntent.updateProgress: Validation failed', { error: validation.error.issues, userId: req.user.userId });
            return res.status(400).json(Result.fail(validation.error.issues));
        }

        const { lectureId, completed } = validation.data;
        logger.info('ProgressIntent.updateProgress: Updating progress', { userId: req.user.userId, lectureId, completed });

        const result = await ProgressReducer.updateProgress(req.user.userId, lectureId, completed);

        if (result.success) {
            logger.info('ProgressIntent.updateProgress: Progress updated successfully', { userId: req.user.userId, lectureId });
            res.json(result);
        } else {
            logger.warn('ProgressIntent.updateProgress: Failed to update progress', { userId: req.user.userId, lectureId, error: result.error });
            res.status(400).json(result);
        }
    }
}
