import { createHash, randomBytes } from 'crypto';
import jwt from 'jsonwebtoken';
import { prisma } from './prisma';
import { config } from './config';

interface TokenPayload {
  userId: string;
  role: string;
}

const tokenBlacklist = new Set<string>();

export const signToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: `${config.jwt.accessTtlMinutes}m`,
  });
};

export const signRefreshToken = (payload: TokenPayload): string => {
  return jwt.sign(payload, config.jwt.refreshSecret || config.jwtSecret, {
    expiresIn: `${config.jwt.refreshTtlDays}d`,
  });
};

export async function createRefreshTokenRecord(userId: string, rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  const expiresAt = new Date(Date.now() + config.jwt.refreshTtlDays * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId, tokenHash, expiresAt },
  });
}

export async function revokeRefreshToken(rawToken: string) {
  const tokenHash = createHash('sha256').update(rawToken).digest('hex');
  await prisma.refreshToken.updateMany({
    where: { tokenHash, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export async function verifyRefreshToken(rawToken: string): Promise<TokenPayload | null> {
  try {
    const payload = jwt.verify(
      rawToken,
      config.jwt.refreshSecret || config.jwtSecret,
    ) as TokenPayload;

    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const record = await prisma.refreshToken.findFirst({
      where: {
        tokenHash,
        userId: payload.userId,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    return record ? payload : null;
  } catch {
    return null;
  }
}

export const blacklistToken = (token: string) => {
  if (!token) return;
  tokenBlacklist.add(token);
};

export const isTokenBlacklisted = (token: string) => tokenBlacklist.has(token);

export const verifyToken = (token: string): TokenPayload | null => {
  try {
    if (isTokenBlacklisted(token)) return null;
    return jwt.verify(token, config.jwtSecret) as TokenPayload;
  } catch {
    return null;
  }
};

export default {
  blacklistToken,
  isTokenBlacklisted,
};
