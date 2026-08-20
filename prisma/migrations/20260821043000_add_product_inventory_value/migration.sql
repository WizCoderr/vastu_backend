-- The 20260819000000_add_wac_inventory_fields migration was later edited to
-- include Product.inventoryValue after it had already been applied, so this
-- database never received the column. IF NOT EXISTS keeps this safe on DBs
-- that already ran the updated SQL.
ALTER TABLE "Product" ADD COLUMN IF NOT EXISTS "inventoryValue" DECIMAL(12,2) NOT NULL DEFAULT 0;

UPDATE "Product"
SET "inventoryValue" = ROUND("stock" * COALESCE("purchasePrice", 0), 2)
WHERE "stock" > 0;
