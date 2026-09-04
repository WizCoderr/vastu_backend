import type { Request, Response, NextFunction } from 'express';
import { getRedis } from '../core/redis';
import { config } from '../core/config';
import type { AuthRequest } from '../core/authMiddleware';

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
          return res.status(429).json({ success: false, error: 'Too many requests' });
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
        res.setHeader('Retry-After', String(options.windowSec));
        return res.status(429).json({ success: false, error: 'Too many requests' });
      }
      return next();
    } catch {
      return next();
    }
  };
}

export const paymentCreateRateLimit = createRedisRateLimiter({
  windowSec: 60,
  max: config.security.rateLimit.paymentCreateMax,
  keyPrefix: 'rl:pay:create',
  useUserId: true,
});

export const paymentVerifyRateLimit = createRedisRateLimiter({
  windowSec: 60,
  max: config.security.rateLimit.paymentVerifyMax,
  keyPrefix: 'rl:pay:verify',
  useUserId: true,
});

export const paymentStatusRateLimit = createRedisRateLimiter({
  windowSec: 60,
  max: config.security.rateLimit.paymentStatusMax,
  keyPrefix: 'rl:pay:status',
  useUserId: true,
});

export const webhookRateLimit = createRedisRateLimiter({
  windowSec: 60,
  max: config.security.rateLimit.webhookMax,
  keyPrefix: 'rl:pay:webhook',
});
