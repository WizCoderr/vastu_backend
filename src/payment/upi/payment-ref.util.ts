import { randomBytes } from 'crypto';
import { config } from '../../core/config';

export function generateMerchantTxnRef(prefix = 'TXN'): string {
  const suffix = randomBytes(6).toString('hex').toUpperCase();
  return `${prefix}${Date.now().toString().slice(-8)}${suffix}`;
}

export function generateOrderRef(prefix = 'ORDER'): string {
  const suffix = randomBytes(4).toString('hex').toUpperCase();
  return `${prefix}${Date.now().toString().slice(-8)}${suffix}`;
}

export function getPaymentExpiryDate(): Date {
  return new Date(Date.now() + config.upi.paymentExpiryMinutes * 60 * 1000);
}

export function isPaymentExpired(expiresAt: Date | null | undefined): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() < Date.now();
}
