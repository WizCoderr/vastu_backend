import { getRedis } from '../../config/redis';
import { config } from '../../core/config';

const PREFIX = 'payment:status:';

export type CachedPaymentStatus = Record<string, unknown>;

export async function getCachedPaymentStatus(
  transactionId: string,
): Promise<CachedPaymentStatus | null> {
  const redis = getRedis();
  if (!redis) return null;

  const raw = await redis.get(`${PREFIX}${transactionId}`);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as CachedPaymentStatus;
  } catch {
    return null;
  }
}

export async function setCachedPaymentStatus(
  transactionId: string,
  payload: CachedPaymentStatus,
  status: string,
): Promise<void> {
  const redis = getRedis();
  if (!redis) return;

  const isTerminal = ['COMPLETED', 'PAID', 'FAILED', 'REFUNDED'].includes(status);
  const ttl = isTerminal
    ? config.redis.cacheTtlTerminalSec
    : config.redis.cacheTtlPendingSec;

  await redis.set(`${PREFIX}${transactionId}`, JSON.stringify(payload), 'EX', ttl);
}

export async function invalidatePaymentStatusCache(transactionId: string): Promise<void> {
  const redis = getRedis();
  if (!redis) return;
  await redis.del(`${PREFIX}${transactionId}`);
}
