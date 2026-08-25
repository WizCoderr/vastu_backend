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
import { replayMovements } from '../src/stock/replay';

const APPLY = process.argv.includes('--apply');

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
