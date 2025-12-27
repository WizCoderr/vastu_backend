import { Request, Response } from 'express';
import { registerSchema, loginSchema } from './auth.dto';
import { AuthReducer } from "./auth.reducer";
import { Result } from '../core/result';
import logger from '../utils/logger';
import { blacklistToken } from '../core/jwt';
import { AuthRequest } from '../core/authMiddleware';

export class AuthIntent {
    static async register(req: Request, res: Response) {
        // Sanitize body for logging
        const { password, ...logBody } = req.body;
        logger.info('AuthIntent.register: Attempting registration', { body: logBody });

        const validation = registerSchema.safeParse(req.body);

        if (!validation.success) {
            logger.warn('AuthIntent.register: Validation failed', { error: validation.error });
            return res.status(400).json(Result.fail(validation.error));
        }

        const result = await AuthReducer.register(validation.data);

        if (result.success) {
            logger.info('AuthIntent.register: Registration successful', { userId: result.data.user.id });
            return res.status(201).json(result);
        } else {
            logger.error('AuthIntent.register: Registration failed', { error: result.error });
            return res.status(400).json(result);
        }
    }

    static async login(req: Request, res: Response) {
        const { password, ...logBody } = req.body;
        logger.info('AuthIntent.login: Attempting login', { body: logBody });

        const validation = loginSchema.safeParse(req.body);

        if (!validation.success) {
            logger.warn('AuthIntent.login: Validation failed', { error: validation.error });
            return res.status(400).json(Result.fail(validation.error));
        }

        const result = await AuthReducer.login(validation.data);

        if (result.success) {
            logger.info('AuthIntent.login: Login successful', { userId: result.data.user.id });
            return res.status(200).json(result);
        } else {
            logger.warn('AuthIntent.login: Login failed', { error: result.error });
            return res.status(401).json(result);
        }
    }

    static logout(req: AuthRequest, res: Response) {
        logger.info('AuthIntent.logout: Attempting logout', { userId: req.user?.userId });
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            blacklistToken(token);
            logger.info('AuthIntent.logout: Token blacklisted', { userId: req.user?.userId });
        }
        return res.status(200).json(Result.ok({ message: 'Logged out' }));
    }

    static async getUser(req: AuthRequest, res: Response) {
        if (!req.user) return res.status(401).json(Result.fail('Unauthorized'));

        const result = await AuthReducer.getUser(req.user.userId);

        if (result.success) {
            return res.json(result);
        } else {
            return res.status(404).json(result);
        }
    }
}
