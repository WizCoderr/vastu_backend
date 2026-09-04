import Redis from 'ioredis';
import { config } from './config';
import logger from '../utils/logger';

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!config.redis.enabled) return null;

  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      retryStrategy: (times) => Math.min(times * 200, 5000),
    });

    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connected');
    });
  }

  return redisClient;
}

export async function checkRedisHealth(): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return false;
  try {
    const pong = await redis.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

export async function acquireRedisLock(
  key: string,
  ttlSeconds: number,
): Promise<boolean> {
  const redis = getRedis();
  if (!redis) return true;

  const result = await redis.set(key, `${process.pid}`, 'EX', ttlSeconds, 'NX');
  return result === 'OK';
}

export async function releaseRedisLock(key: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(key);
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}
