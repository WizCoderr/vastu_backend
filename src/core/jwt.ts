import jwt from 'jsonwebtoken';
import { config } from './config';

interface TokenPayload {
    userId: string;
    role: string;
}

export const signToken = (payload: TokenPayload): string => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
};

export const verifyToken = (token: string): TokenPayload | null => {
    try {
        return jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch (error) {
        return null;
    }
};
