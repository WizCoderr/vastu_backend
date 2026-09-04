import { describe, expect, test } from 'bun:test';
import { buildUpiUri } from '../src/payment/upi/upi-uri.builder';
import { buildUpiDeepLink } from '../src/payment/upi/upi-deep-links';
import { generateMerchantTxnRef } from '../src/payment/upi/payment-ref.util';

describe('UPI URI builder', () => {
  test('builds valid upi pay URI', () => {
    const uri = buildUpiUri({
      vpa: 'payments@wizhub',
      payeeName: 'WizHub',
      transactionRef: 'TXN123',
      transactionNote: 'Test payment',
      amount: 999,
    });

    expect(uri.startsWith('upi://pay?')).toBe(true);
    expect(uri).toContain('pa=payments%40wizhub');
    expect(uri).toContain('am=999.00');
    expect(uri).toContain('tr=TXN123');
  });

  test('builds google pay deep link', () => {
    const uri = buildUpiDeepLink('google_pay', {
      vpa: 'payments@wizhub',
      payeeName: 'WizHub',
      transactionRef: 'TXN123',
      transactionNote: 'Test',
      amount: 100,
    });

    expect(uri.startsWith('tez://upi/pay?')).toBe(true);
  });

  test('generates unique merchant refs', () => {
    const a = generateMerchantTxnRef();
    const b = generateMerchantTxnRef();
    expect(a).not.toBe(b);
    expect(a.startsWith('TXN')).toBe(true);
  });
});
