/** Pure weighted-average inventory helpers (no DB). */

export const round2 = (n: number) => Math.round(n * 100) / 100;

export type InventoryState = {
  stock: number;
  inventoryValue: number;
  purchasePrice: number | null;
};

export function deriveAverageCost(stock: number, inventoryValue: number): number | null {
  if (stock <= 0) return null;
  return round2(inventoryValue / stock);
}

/** COGS for a partial sale; last unit clears remaining value. */
export function computeCogs(inventoryValue: number, oldStock: number, qtySold: number): number {
  if (oldStock <= 0 || qtySold <= 0) return 0;
  if (qtySold >= oldStock) return inventoryValue;
  return round2((inventoryValue * qtySold) / oldStock);
}

export function applyInbound(
  state: InventoryState,
  qty: number,
  batchCost: number,
): InventoryState {
  const newValue = round2(state.inventoryValue + qty * batchCost);
  const newStock = state.stock + qty;
  const newAvg = round2(newValue / newStock);
  return { stock: newStock, inventoryValue: newValue, purchasePrice: newAvg };
}

export function applyOutbound(
  state: InventoryState,
  qty: number,
): { state: InventoryState; cogs: number } {
  const cogs = computeCogs(state.inventoryValue, state.stock, qty);
  const newStock = state.stock - qty;
  if (newStock <= 0) {
    return {
      cogs,
      state: {
        stock: 0,
        inventoryValue: 0,
        purchasePrice: state.purchasePrice,
      },
    };
  }
  const newValue = round2(state.inventoryValue - cogs);
  const newAvg = round2(newValue / newStock);
  return {
    cogs,
    state: { stock: newStock, inventoryValue: newValue, purchasePrice: newAvg },
  };
}

export function applyRestore(state: InventoryState, qty: number, unitCostAtSale: number): InventoryState {
  const newValue = round2(state.inventoryValue + qty * unitCostAtSale);
  const newStock = state.stock + qty;
  const newAvg = round2(newValue / newStock);
  return { stock: newStock, inventoryValue: newValue, purchasePrice: newAvg };
}

export function previewInbound(
  oldStock: number,
  oldValue: number,
  addedQty: number,
  batchCost: number,
  lastPurchasePrice?: number | null,
) {
  const batchValue = round2(addedQty * batchCost);
  const newValue = round2(oldValue + batchValue);
  const newStock = oldStock + addedQty;
  const newAvg = newStock > 0 ? round2(newValue / newStock) : batchCost;
  const valueAtLastCost = lastPurchasePrice != null ? round2(newStock * lastPurchasePrice) : null;
  return { batchValue, newValue, newStock, newAvg, valueAtLastCost };
}
