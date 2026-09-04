import { timingSafeEqual } from 'crypto';

export function secureCompare(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export function isValidMerchantTxnRef(value: string): boolean {
  return /^[A-Z0-9_-]{8,64}$/i.test(value);
}

export function isValidUtr(value: string): boolean {
  return /^[A-Z0-9]{6,32}$/i.test(value.trim());
}

export function sanitizeDescription(value: string): string {
  return value.replace(/[<>"'`]/g, '').trim().slice(0, 120);
}
