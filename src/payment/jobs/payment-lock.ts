import { getRedis } from '../../config/redis';
import { config } from '../../core/config';

export async function withPaymentLock<T>(
  merchantTxnRef: string,
  fn: () => Promise<T>,
): Promise<T | null> {
  const redis = getRedis();
  if (!redis) return fn();

  const key = `payment:lock:${merchantTxnRef}`;
  const token = `${Date.now()}-${Math.random()}`;
  const acquired = await redis.set(key, token, 'PX', config.redis.lockTtlMs, 'NX');

  if (!acquired) {
    return null;
  }

  try {
    return await fn();
  } finally {
    const current = await redis.get(key);
    if (current === token) {
      await redis.del(key);
    }
  }
}
