import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './jwt';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        role: string;
    };
}

export const requireAuth = (req: AuthRequest, res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ success: false, error: 'Unauthorized: No token provided' });
    }

    const token = authHeader.split(' ')[1];
    const payload = verifyToken(token);

    if (!payload) {
        return res.status(401).json({ success: false, error: 'Unauthorized: Invalid token' });
    }

    req.user = payload;
    next();
};
