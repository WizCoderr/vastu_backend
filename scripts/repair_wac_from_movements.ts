/**
 * Rebuild Product.inventoryValue + purchasePrice (WAC) from stock movements
 * that carry unitCost. Skips products that have inbound qty without unitCost
 * (cannot reconstruct). Dry-run by default; pass --apply to write.
 *
 * Usage:
 *   bun run scripts/repair_wac_from_movements.ts
 *   bun run scripts/repair_wac_from_movements.ts --apply
 */
import 'dotenv/config';
import { prisma } from '../src/core/prisma';
import {
  applyInbound,
  applyOutbound,
  applyRestore,
  deriveAverageCost,
  round2,
  type InventoryState,
} from '../src/stock/wac';

const APPLY = process.argv.includes('--apply');

function replayMovements(
  movements: { type: string; quantityChange: number; unitCost: number | null }[],
): { state: InventoryState; ok: boolean; reason?: string } {
  let state: InventoryState = { stock: 0, inventoryValue: 0, purchasePrice: null };

  for (const m of movements) {
    const qty = m.quantityChange;
    const unitCost = m.unitCost;

    if (qty > 0) {
      if (unitCost == null) {
        return { state, ok: false, reason: 'inbound without unitCost' };
      }
      // ORDER positives are stock restores; other inbound types are purchases
      state =
        m.type === 'ORDER'
          ? applyRestore(state, qty, unitCost)
          : applyInbound(state, qty, unitCost);
      continue;
    }

    if (qty < 0) {
      const { state: next } = applyOutbound(state, Math.abs(qty));
      state = next;
      continue;
    }

    // qty === 0: opening-cost marker
    if (unitCost != null && state.stock > 0 && state.inventoryValue <= 0) {
      state = {
        stock: state.stock,
        inventoryValue: round2(state.stock * unitCost),
        purchasePrice: unitCost,
      };
    }
  }

  const avg = deriveAverageCost(state.stock, state.inventoryValue);
  return {
    ok: true,
    state: {
      ...state,
      purchasePrice: avg ?? state.purchasePrice,
    },
  };
}

async function main() {
  const products = await prisma.product.findMany({
    select: {
      id: true,
      name: true,
      stock: true,
      inventoryValue: true,
      purchasePrice: true,
      lastPurchasePrice: true,
      stockMovements: {
        orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
        select: { type: true, quantityChange: true, unitCost: true },
      },
    },
  });

  let wouldUpdate = 0;
  let skipped = 0;

  for (const p of products) {
    const movements = p.stockMovements.map((m) => ({
      type: m.type,
      quantityChange: m.quantityChange,
      unitCost: m.unitCost != null ? Number(m.unitCost) : null,
    }));

    if (movements.length === 0) {
      skipped++;
      continue;
    }

    const { ok, state, reason } = replayMovements(movements);
    if (!ok) {
      skipped++;
      console.log(`skip ${p.name}: ${reason}`);
      continue;
    }

    if (state.stock !== p.stock) {
      skipped++;
      console.log(
        `skip ${p.name}: replayed stock ${state.stock} != on-hand ${p.stock} (history incomplete)`,
      );
      continue;
    }

    const currentValue = Number(p.inventoryValue);
    const currentAvg = p.purchasePrice != null ? Number(p.purchasePrice) : null;
    const nextAvg = state.purchasePrice;
    const valueDiff = Math.abs(currentValue - state.inventoryValue) > 0.02;
    const avgDiff =
      (currentAvg == null && nextAvg != null) ||
      (currentAvg != null && nextAvg == null) ||
      (currentAvg != null && nextAvg != null && Math.abs(currentAvg - nextAvg) > 0.02);

    if (!valueDiff && !avgDiff) continue;

    wouldUpdate++;
    console.log(
      `${APPLY ? 'UPDATE' : 'DRY'} ${p.name}: value ${currentValue} → ${state.inventoryValue}, avg ${currentAvg} → ${nextAvg}`,
    );

    if (APPLY) {
      await prisma.product.update({
        where: { id: p.id },
        data: {
          inventoryValue: state.inventoryValue,
          purchasePrice: nextAvg,
        },
      });
    }
  }

  console.log(
    `\nDone. ${wouldUpdate} product(s) ${APPLY ? 'updated' : 'would update'}, ${skipped} skipped. Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
