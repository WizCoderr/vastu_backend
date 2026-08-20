import { describe, expect, test } from 'bun:test';
import {
  applyInbound,
  applyOutbound,
  applyRestore,
  computeCogs,
  previewInbound,
  round2,
} from './wac';

describe('WAC paper example (100 @ 50, then 50 @ 60)', () => {
  test('step 1: 100 strips @ 50 = 5000', () => {
    const state = applyInbound({ stock: 0, inventoryValue: 0, purchasePrice: null }, 100, 50);
    expect(state.stock).toBe(100);
    expect(state.inventoryValue).toBe(5000);
    expect(state.purchasePrice).toBe(50);
  });

  test('step 2: +50 @ 60 → 8000 value, 53.33 avg, 9000 at last cost', () => {
    let state = applyInbound({ stock: 0, inventoryValue: 0, purchasePrice: null }, 100, 50);
    state = applyInbound(state, 50, 60);
    expect(state.stock).toBe(150);
    expect(state.inventoryValue).toBe(8000);
    expect(state.purchasePrice).toBe(53.33);

    const preview = previewInbound(100, 5000, 50, 60, 60);
    expect(preview.newValue).toBe(8000);
    expect(preview.newAvg).toBe(53.33);
    expect(preview.valueAtLastCost).toBe(9000);
  });

  test('step 3: sell 1 @ 75 → COGS 53.33, profit 21.67, value 7946.67', () => {
    let state = applyInbound({ stock: 0, inventoryValue: 0, purchasePrice: null }, 100, 50);
    state = applyInbound(state, 50, 60);

    const cogs = computeCogs(state.inventoryValue, state.stock, 1);
    expect(cogs).toBe(53.33);

    const { state: afterSale, cogs: cogsOut } = applyOutbound(state, 1);
    expect(cogsOut).toBe(53.33);
    expect(afterSale.stock).toBe(149);
    expect(afterSale.inventoryValue).toBe(7946.67);
    expect(afterSale.purchasePrice).toBe(53.33);

    const salePrice = 75;
    expect(round2(salePrice - cogsOut)).toBe(21.67);
  });

  test('step 4: sell remaining 149 → inventory value 0', () => {
    let state = applyInbound({ stock: 0, inventoryValue: 0, purchasePrice: null }, 100, 50);
    state = applyInbound(state, 50, 60);
    const { state: afterOne } = applyOutbound(state, 1);
    const { state: afterAll } = applyOutbound(afterOne, 149);
    expect(afterAll.stock).toBe(0);
    expect(afterAll.inventoryValue).toBe(0);
    expect(afterAll.purchasePrice).toBe(53.33);
  });

  test('step 5: restore 1 at 53.33 → back to 150 @ 8000', () => {
    let state = applyInbound({ stock: 0, inventoryValue: 0, purchasePrice: null }, 100, 50);
    state = applyInbound(state, 50, 60);
    const { state: afterOne } = applyOutbound(state, 1);
    const { state: afterAll } = applyOutbound(afterOne, 149);
    const restored = applyRestore(afterAll, 1, 53.33);
    expect(restored.stock).toBe(1);
    expect(restored.inventoryValue).toBe(53.33);
    expect(restored.purchasePrice).toBe(53.33);
  });
});
