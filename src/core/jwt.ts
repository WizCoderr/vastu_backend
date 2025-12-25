import jwt from 'jsonwebtoken';
import { config } from './config';

interface TokenPayload {
    userId: string;
    role: string;
}
const tokenBlacklist = new Set<string>();

export const signToken = (payload: TokenPayload): string => {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: '7d' });
};

export const blacklistToken = (token: string) => {
    if (!token) return;
    tokenBlacklist.add(token);
};

export const isTokenBlacklisted = (token: string) => tokenBlacklist.has(token);

export const verifyToken = (token: string): TokenPayload | null => {
    try {
        if (isTokenBlacklisted(token)) return null;
        return jwt.verify(token, config.jwtSecret) as TokenPayload;
    } catch (error) {
        return null;
    }
};

export default {
    blacklistToken,
    isTokenBlacklisted,
};
