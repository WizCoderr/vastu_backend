import { describe, expect, test } from 'bun:test';
import type { Response } from 'express';
import { createRedisRateLimiter } from './rate-limit.middleware';
import type { AuthRequest } from '../core/authMiddleware';

function mockReq(ip = '127.0.0.1', userId?: string): AuthRequest {
  return {
    ip,
    user: userId ? { userId, role: 'STUDENT' } : undefined,
  } as AuthRequest;
}

function mockRes() {
  const headers: Record<string, string> = {};
  let statusCode = 200;
  let body: unknown;
  const res = {
    setHeader(name: string, value: string) {
      headers[name] = value;
      return res;
    },
    status(code: number) {
      statusCode = code;
      return res;
    },
    json(payload: unknown) {
      body = payload;
      return res;
    },
    get statusCode() {
      return statusCode;
    },
    get body() {
      return body;
    },
    get headers() {
      return headers;
    },
  };
  return res as unknown as Response & {
    statusCode: number;
    body: unknown;
    headers: Record<string, string>;
  };
}

describe('createRedisRateLimiter (memory fallback)', () => {
  test('allows requests under max, then returns 429 with Retry-After', async () => {
    const limiter = createRedisRateLimiter({
      windowSec: 60,
      max: 3,
      keyPrefix: 'rl:test:login',
    });

    for (let i = 0; i < 3; i++) {
      const res = mockRes();
      let nextCalled = false;
      await limiter(mockReq(), res, () => {
        nextCalled = true;
      });
      expect(nextCalled).toBe(true);
      expect(res.statusCode).toBe(200);
    }

    const blocked = mockRes();
    let nextCalled = false;
    await limiter(mockReq(), blocked, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(false);
    expect(blocked.statusCode).toBe(429);
    expect(blocked.headers['Retry-After']).toBeTruthy();
    expect(blocked.body).toEqual({
      success: false,
      error: 'Too many requests. Please try again later.',
    });
  });

  test('tracks IPs separately', async () => {
    const limiter = createRedisRateLimiter({
      windowSec: 60,
      max: 1,
      keyPrefix: 'rl:test:ip',
    });

    const a = mockRes();
    let nextA = false;
    await limiter(mockReq('1.1.1.1'), a, () => {
      nextA = true;
    });
    expect(nextA).toBe(true);

    const b = mockRes();
    let nextB = false;
    await limiter(mockReq('2.2.2.2'), b, () => {
      nextB = true;
    });
    expect(nextB).toBe(true);

    const a2 = mockRes();
    let nextA2 = false;
    await limiter(mockReq('1.1.1.1'), a2, () => {
      nextA2 = true;
    });
    expect(nextA2).toBe(false);
    expect(a2.statusCode).toBe(429);
  });

  test('includes userId in key when useUserId is true', async () => {
    const limiter = createRedisRateLimiter({
      windowSec: 60,
      max: 1,
      keyPrefix: 'rl:test:user',
      useUserId: true,
    });

    const u1 = mockRes();
    let next1 = false;
    await limiter(mockReq('10.0.0.1', 'user-a'), u1, () => {
      next1 = true;
    });
    expect(next1).toBe(true);

    const u2 = mockRes();
    let next2 = false;
    await limiter(mockReq('10.0.0.1', 'user-b'), u2, () => {
      next2 = true;
    });
    expect(next2).toBe(true);

    const u1Again = mockRes();
    let nextAgain = false;
    await limiter(mockReq('10.0.0.1', 'user-a'), u1Again, () => {
      nextAgain = true;
    });
    expect(nextAgain).toBe(false);
    expect(u1Again.statusCode).toBe(429);
  });
});
