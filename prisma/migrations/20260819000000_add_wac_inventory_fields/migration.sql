-- Weighted average inventory costing fields
ALTER TABLE "Product" ADD COLUMN "lastPurchasePrice" DECIMAL(10,2);
ALTER TABLE "Product" ADD COLUMN "inventoryValue" DECIMAL(12,2) NOT NULL DEFAULT 0;

ALTER TABLE "StockMovement" ADD COLUMN "unitCost" DECIMAL(10,2);

ALTER TABLE "OrderItem" ADD COLUMN "unitCostAtSale" DECIMAL(10,2);

-- Backfill last purchase price from existing average cost
UPDATE "Product"
SET "lastPurchasePrice" = "purchasePrice"
WHERE "purchasePrice" IS NOT NULL;

-- Backfill on-hand inventory value from stock × average cost
UPDATE "Product"
SET "inventoryValue" = ROUND("stock" * COALESCE("purchasePrice", 0), 2)
WHERE "stock" > 0;

-- Backfill historical sale cost snapshots from product WAC at migration time
UPDATE "OrderItem" oi
SET "unitCostAtSale" = p."purchasePrice"
FROM "Product" p
WHERE oi."productId" = p.id
  AND p."purchasePrice" IS NOT NULL
  AND oi."unitCostAtSale" IS NULL;
