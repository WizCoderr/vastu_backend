import { Response } from 'express';
import { AuthRequest } from '../core/authMiddleware';
import { progressUpdateSchema } from '../course/course.dto';
import { ProgressReducer } from './progress.reducer';
import { Result } from '../core/result';

export class ProgressIntent {
    static async updateProgress(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json(Result.fail('Unauthorized'));

        const validation = progressUpdateSchema.safeParse(req.body);
        if (!validation.success) {
            return res.status(400).json(Result.fail(validation.error.issues));
        }

        const { lectureId, completed } = validation.data;
        const result = await ProgressReducer.updateProgress(req.user.userId, lectureId, completed);

        if (result.success) {
            res.json(result);
        } else {
            res.status(400).json(result);
        }
    }
}
