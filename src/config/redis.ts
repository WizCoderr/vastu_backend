import Redis from 'ioredis';
import { config } from '../core/config';
import { paymentLogger } from './logger';

let redisClient: Redis | null = null;

export function getRedis(): Redis | null {
  if (!config.redis.enabled) return null;

  if (!redisClient) {
    redisClient = new Redis(config.redis.url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: true,
      lazyConnect: false,
      connectTimeout: config.redis.connectTimeoutMs,
      commandTimeout: config.redis.commandTimeoutMs,
      retryStrategy: (times) => Math.min(times * 200, 3000),
    });

    redisClient.on('error', (err) => {
      paymentLogger.error('Redis connection error', { error: err.message });
    });

    redisClient.on('connect', () => {
      paymentLogger.info('Redis connected');
    });
  }

  return redisClient;
}

export function createRedisDuplicate(): Redis | null {
  const client = getRedis();
  return client ? client.duplicate() : null;
}

export async function closeRedis(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
  }
}

export async function pingRedis(): Promise<boolean> {
  const client = getRedis();
  if (!client) return false;
  try {
    const pong = await client.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}
