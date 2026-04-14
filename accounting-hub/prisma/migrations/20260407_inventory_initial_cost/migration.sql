-- Add initialUnitCost to InventoryItem (preserves the price set at creation)
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "initialUnitCost" DECIMAL(65,30);

-- Backfill: set initialUnitCost to current unitCost for existing items
UPDATE "InventoryItem" SET "initialUnitCost" = "unitCost" WHERE "initialUnitCost" IS NULL;
