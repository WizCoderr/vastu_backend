import type { Response, NextFunction } from 'express';
import { getRedis } from '../core/redis';
import { config } from '../core/config';
import type { AuthRequest } from '../core/authMiddleware';

const RATE_LIMIT_ERROR = 'Too many requests. Please try again later.';

interface RateLimitOptions {
  windowSec: number;
  max: number;
  keyPrefix: string;
  useUserId?: boolean;
}

export function createRedisRateLimiter(options: RateLimitOptions) {
  const memoryCounts = new Map<string, { count: number; resetAt: number }>();

  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    const userPart = options.useUserId && req.user?.userId ? `:${req.user.userId}` : '';
    const key = `${options.keyPrefix}:${req.ip ?? 'unknown'}${userPart}`;
    const redis = getRedis();

    try {
      if (redis) {
        const count = await redis.incr(key);
        if (count === 1) {
          await redis.expire(key, options.windowSec);
        }
        if (count > options.max) {
          res.setHeader('Retry-After', String(options.windowSec));
          return res.status(429).json({ success: false, error: RATE_LIMIT_ERROR });
        }
        return next();
      }

      const now = Date.now();
      const entry = memoryCounts.get(key);
      if (!entry || entry.resetAt <= now) {
        memoryCounts.set(key, { count: 1, resetAt: now + options.windowSec * 1000 });
        return next();
      }

      entry.count += 1;
      if (entry.count > options.max) {
        const retryAfterSec = Math.max(1, Math.ceil((entry.resetAt - now) / 1000));
        res.setHeader('Retry-After', String(retryAfterSec));
        return res.status(429).json({ success: false, error: RATE_LIMIT_ERROR });
      }
      return next();
    } catch {
      return next();
    }
  };
}

const windowSec = config.security.rateLimitWindowSec;
const { rateLimit } = config.security;

export const globalRateLimit = createRedisRateLimiter({
  windowSec,
  max: rateLimit.globalMax,
  keyPrefix: 'rl:global',
});

export const authLoginRateLimit = createRedisRateLimiter({
  windowSec,
  max: rateLimit.authLoginMax,
  keyPrefix: 'rl:auth:login',
});

export const authPasswordResetRateLimit = createRedisRateLimiter({
  windowSec,
  max: rateLimit.authPasswordResetMax,
  keyPrefix: 'rl:auth:reset',
});

export const paymentCreateRateLimit = createRedisRateLimiter({
  windowSec,
  max: rateLimit.paymentCreateMax,
  keyPrefix: 'rl:pay:create',
  useUserId: true,
});

export const paymentVerifyRateLimit = createRedisRateLimiter({
  windowSec,
  max: rateLimit.paymentVerifyMax,
  keyPrefix: 'rl:pay:verify',
  useUserId: true,
});

export const webhookRateLimit = createRedisRateLimiter({
  windowSec,
  max: rateLimit.webhookMax,
  keyPrefix: 'rl:pay:webhook',
});

export const publicRateLimit = createRedisRateLimiter({
  windowSec,
  max: rateLimit.publicMax,
  keyPrefix: 'rl:public',
});
