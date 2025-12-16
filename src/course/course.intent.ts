import { Request, Response } from 'express';
import { CourseReducer } from './course.reducer';
import { Result } from '../core/result';
import { AuthRequest } from '../core/authMiddleware';

export class CourseIntent {
    static async listCourses(req: Request, res: Response) {
        const result = await CourseReducer.listCourses();
        res.json(result);
    }

    static async getCourse(req: AuthRequest, res: Response) {
        const { id } = req.params;
        // We can allow viewing details without auth, but getUser if available?
        // Requirement said: "STUDENT (JWT PROTECTED)" for these routes.
        // So we assume req.user is populated by middleware.

        if (!req.user) return res.status(401).json(Result.fail('Unauthorized'));

        const result = await CourseReducer.getCourseDetail(id, req.user.userId);

        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json(result);
        }
    }

    static async getCurriculum(req: AuthRequest, res: Response) {
        const { id } = req.params;
        if (!req.user) return res.status(401).json(Result.fail('Unauthorized'));

        const result = await CourseReducer.getCurriculum(id, req.user.userId);

        if (result.success) {
            res.json(result);
        } else {
            res.status(403).json(result);
        }
    }
}
