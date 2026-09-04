import { describe, expect, test, beforeEach } from 'bun:test';
import {
  MockGoogleWalletService,
  setGoogleWalletServiceForTests,
} from '../src/wallet/google-wallet.client';
import type { WalletPassPayload } from '../src/wallet/google-wallet.types';

const samplePayload = (): WalletPassPayload => ({
  orderId: '11111111-2222-3333-4444-555555555555',
  orderShortId: '11111111',
  userName: 'Test User',
  userEmail: 'test@example.com',
  totalAmount: 499,
  currency: 'INR',
  itemCount: 2,
  items: [
    { name: 'Yantra', quantity: 1, price: 299 },
    { name: 'Book', quantity: 1, price: 200 },
  ],
  shippingCity: 'Delhi',
  paidAt: '2026-09-04',
  barcodeValue: '11111111-2222-3333-4444-555555555555',
});

describe('MockGoogleWalletService', () => {
  let gw: MockGoogleWalletService;

  beforeEach(() => {
    gw = new MockGoogleWalletService();
    setGoogleWalletServiceForTests(gw);
  });

  test('isConfigured returns true', () => {
    expect(gw.isConfigured()).toBe(true);
  });

  test('ensurePassClass returns class id', async () => {
    const cls = await gw.ensurePassClass();
    expect(cls.classId).toContain('vastu_order_receipt');
  });

  test('createOrGetPassObject is idempotent', async () => {
    const payload = samplePayload();
    const first = await gw.createOrGetPassObject(payload);
    const second = await gw.createOrGetPassObject(payload);
    expect(first.objectId).toBe(second.objectId);
    expect(first.state).toBe('ACTIVE');
  });

  test('generateSaveToWalletJwt returns save URL', async () => {
    const payload = samplePayload();
    const obj = await gw.createOrGetPassObject(payload);
    const save = await gw.generateSaveToWalletJwt(obj.objectId, obj.classId);
    expect(save.saveUrl.startsWith('https://pay.google.com/gp/v/save/')).toBe(true);
    expect(save.saveJwt.length).toBeGreaterThan(10);
    expect(save.objectId).toBe(obj.objectId);
  });

  test('deactivatePassObject sets INACTIVE', async () => {
    const payload = samplePayload();
    const obj = await gw.createOrGetPassObject(payload);
    const deactivated = await gw.deactivatePassObject(obj.objectId);
    expect(deactivated.state).toBe('INACTIVE');
  });

  test('deactivate unknown object throws WALLET_PASS_NOT_FOUND', async () => {
    expect(gw.deactivatePassObject('missing')).rejects.toThrow('WALLET_PASS_NOT_FOUND');
  });
});

describe('WalletPassPayload barcode', () => {
  test('uses order id as barcode value', () => {
    const p = samplePayload();
    expect(p.barcodeValue).toBe(p.orderId);
  });
});
