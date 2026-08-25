/** Replay stock movements chronologically to rebuild WAC state (no DB). */

import {
  applyInbound,
  applyOutbound,
  applyRestore,
  deriveAverageCost,
  round2,
  type InventoryState,
} from './wac';

export type ReplayMovement = {
  id?: string;
  type: string;
  quantityChange: number;
  unitCost: number | null;
};

export type MovementSnapshot = {
  id?: string;
  previousStock: number;
  newStock: number;
  previousAvgCost: number | null;
  newAvgCost: number | null;
};

export type ReplayResult = {
  ok: boolean;
  reason?: string;
  state: InventoryState;
  lastPurchasePrice: number | null;
  snapshots: MovementSnapshot[];
};

const PURCHASE_INBOUND_TYPES = new Set(['RESTOCK', 'INITIAL']);

export function isDeletablePurchaseMovement(m: {
  type: string;
  quantityChange: number;
}): boolean {
  return PURCHASE_INBOUND_TYPES.has(m.type) && m.quantityChange > 0;
}

function pushSnapshot(
  snapshots: MovementSnapshot[],
  id: string | undefined,
  previousStock: number,
  previousAvgCost: number | null,
  state: InventoryState,
) {
  snapshots.push({
    id,
    previousStock,
    newStock: state.stock,
    previousAvgCost,
    newAvgCost: state.purchasePrice,
  });
}

/**
 * Replay movements in ascending time order.
 * Inbounds without unitCost (legacy rows) only change stock — matching live
 * recordStockChange when WAC is not applied. Outbounds with no inventory value
 * are treated the same way.
 */
export function replayMovements(movements: ReplayMovement[]): ReplayResult {
  let state: InventoryState = { stock: 0, inventoryValue: 0, purchasePrice: null };
  let lastPurchasePrice: number | null = null;
  const snapshots: MovementSnapshot[] = [];

  for (const m of movements) {
    const qty = m.quantityChange;
    const unitCost = m.unitCost;
    const previousStock = state.stock;
    const previousAvgCost = state.purchasePrice;

    if (qty > 0) {
      if (unitCost == null) {
        // Legacy / restore rows that never stored a cost: stock only
        const restoreCost = m.type === 'ORDER' && state.purchasePrice != null
          ? state.purchasePrice
          : null;
        if (restoreCost != null) {
          state = applyRestore(state, qty, restoreCost);
        } else {
          state = { ...state, stock: state.stock + qty };
        }
        pushSnapshot(snapshots, m.id, previousStock, previousAvgCost, state);
        continue;
      }

      state =
        m.type === 'ORDER'
          ? applyRestore(state, qty, unitCost)
          : applyInbound(state, qty, unitCost);

      if (PURCHASE_INBOUND_TYPES.has(m.type)) {
        lastPurchasePrice = unitCost;
      }

      pushSnapshot(snapshots, m.id, previousStock, previousAvgCost, state);
      continue;
    }

    if (qty < 0) {
      const absQty = Math.abs(qty);
      if (absQty > state.stock) {
        return {
          ok: false,
          reason: `insufficient stock for outbound of ${absQty} (on hand ${state.stock})`,
          state,
          lastPurchasePrice,
          snapshots,
        };
      }

      if (state.inventoryValue <= 0 && state.purchasePrice == null) {
        const newStock = state.stock - absQty;
        state =
          newStock <= 0
            ? { stock: 0, inventoryValue: 0, purchasePrice: null }
            : { ...state, stock: newStock };
      } else {
        const { state: next } = applyOutbound(state, absQty);
        state = next;
      }

      pushSnapshot(snapshots, m.id, previousStock, previousAvgCost, state);
      continue;
    }

    // qty === 0: opening-cost marker
    if (unitCost != null && state.stock > 0 && state.inventoryValue <= 0) {
      state = {
        stock: state.stock,
        inventoryValue: round2(state.stock * unitCost),
        purchasePrice: unitCost,
      };
      lastPurchasePrice = unitCost;
    }

    pushSnapshot(snapshots, m.id, previousStock, previousAvgCost, state);
  }

  const avg = deriveAverageCost(state.stock, state.inventoryValue);
  return {
    ok: true,
    state: {
      ...state,
      purchasePrice: avg ?? state.purchasePrice,
    },
    lastPurchasePrice,
    snapshots,
  };
}
