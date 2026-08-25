import { describe, expect, test } from 'bun:test';
import { isDeletablePurchaseMovement, replayMovements } from './replay';

describe('replayMovements', () => {
  test('two restocks then delete newest leaves prior batch as last cost', () => {
    const all = [
      { id: 'a', type: 'RESTOCK', quantityChange: 2, unitCost: 450 },
      { id: 'b', type: 'RESTOCK', quantityChange: 10, unitCost: 400 },
    ];
    const full = replayMovements(all);
    expect(full.ok).toBe(true);
    expect(full.state.stock).toBe(12);
    expect(full.state.inventoryValue).toBe(4900);
    expect(full.state.purchasePrice).toBe(408.33);
    expect(full.lastPurchasePrice).toBe(400);

    const afterDelete = replayMovements(all.filter((m) => m.id !== 'b'));
    expect(afterDelete.ok).toBe(true);
    expect(afterDelete.state.stock).toBe(2);
    expect(afterDelete.state.inventoryValue).toBe(900);
    expect(afterDelete.state.purchasePrice).toBe(450);
    expect(afterDelete.lastPurchasePrice).toBe(450);
  });

  test('rejects outbound when stock would go negative', () => {
    const result = replayMovements([
      { type: 'RESTOCK', quantityChange: 2, unitCost: 100 },
      { type: 'ORDER', quantityChange: -5, unitCost: null },
    ]);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('insufficient stock');
  });

  test('ORDER restore does not update lastPurchasePrice', () => {
    const result = replayMovements([
      { type: 'RESTOCK', quantityChange: 5, unitCost: 100 },
      { type: 'ORDER', quantityChange: -2, unitCost: null },
      { type: 'ORDER', quantityChange: 2, unitCost: 100 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.state.stock).toBe(5);
    expect(result.lastPurchasePrice).toBe(100);
  });

  test('legacy inbound without unitCost is stock-only and still replays', () => {
    const result = replayMovements([
      { type: 'INITIAL', quantityChange: 2, unitCost: null },
      { type: 'ADJUSTMENT', quantityChange: -1, unitCost: null },
      { type: 'ORDER', quantityChange: -1, unitCost: null },
      { type: 'RESTOCK', quantityChange: 1, unitCost: null },
      { type: 'RESTOCK', quantityChange: 2, unitCost: 600 },
      { type: 'RESTOCK', quantityChange: 2, unitCost: 450 },
      { type: 'RESTOCK', quantityChange: 10, unitCost: 400 },
    ]);
    expect(result.ok).toBe(true);
    expect(result.state.stock).toBe(15);
    expect(result.state.inventoryValue).toBe(6100);
    expect(result.state.purchasePrice).toBe(406.67);
    expect(result.lastPurchasePrice).toBe(400);
  });

  test('delete latest restock after legacy null-cost rows', () => {
    const all = [
      { id: 'i', type: 'INITIAL', quantityChange: 2, unitCost: null },
      { id: 'a', type: 'ADJUSTMENT', quantityChange: -1, unitCost: null },
      { id: 'o', type: 'ORDER', quantityChange: -1, unitCost: null },
      { id: 'r0', type: 'RESTOCK', quantityChange: 1, unitCost: null },
      { id: 'r1', type: 'RESTOCK', quantityChange: 2, unitCost: 600 },
      { id: 'r2', type: 'RESTOCK', quantityChange: 2, unitCost: 450 },
      { id: 'r3', type: 'RESTOCK', quantityChange: 10, unitCost: 400 },
    ];
    const after = replayMovements(all.filter((m) => m.id !== 'r3'));
    expect(after.ok).toBe(true);
    expect(after.state.stock).toBe(5);
    expect(after.state.inventoryValue).toBe(2100);
    expect(after.state.purchasePrice).toBe(420);
    expect(after.lastPurchasePrice).toBe(450);
  });
});

describe('isDeletablePurchaseMovement', () => {
  test('only positive RESTOCK/INITIAL', () => {
    expect(isDeletablePurchaseMovement({ type: 'RESTOCK', quantityChange: 10 })).toBe(true);
    expect(isDeletablePurchaseMovement({ type: 'INITIAL', quantityChange: 5 })).toBe(true);
    expect(isDeletablePurchaseMovement({ type: 'ORDER', quantityChange: 2 })).toBe(false);
    expect(isDeletablePurchaseMovement({ type: 'RESTOCK', quantityChange: -1 })).toBe(false);
    expect(isDeletablePurchaseMovement({ type: 'ADJUSTMENT', quantityChange: 0 })).toBe(false);
  });
});
