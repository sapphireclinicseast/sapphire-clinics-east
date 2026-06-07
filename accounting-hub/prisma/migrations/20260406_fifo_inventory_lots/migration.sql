-- FIFO Inventory Lots: track remaining quantity per purchase lot
-- + Expense Account linking for COGS classification
-- + cogsCost on OrderItem for accurate FIFO-based COGS

-- 1. Add remainingQuantity to InventoryAdjustment (FIFO lot tracking)
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "remainingQuantity" INTEGER;

-- 2. Add expenseAccountId to InventoryItem (COGS account)
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "expenseAccountId" TEXT;
DO $$ BEGIN
  ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_expenseAccountId_fkey"
    FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
CREATE INDEX IF NOT EXISTS "InventoryItem_expenseAccountId_idx" ON "InventoryItem"("expenseAccountId");

-- 3. Add cogsCost to OrderItem (FIFO cost recorded at order time)
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "cogsCost" DECIMAL;

-- 4. Backfill remainingQuantity for existing INCREASE lots — ONE-TIME, REPLAY-SAFE.
-- Strategy: for each item, allocate current on-hand quantity to lots newest-first
-- (since oldest lots would have been consumed first under FIFO).
--
-- CRITICAL SAFEGUARD: the deploy replays every migration.sql on every deploy. The original
-- block unconditionally reset every INCREASE lot to remainingQuantity = 0 and recomputed from
-- current on-hand quantity — so each deploy WIPED the real per-lot FIFO consumption tracked by
-- the app and re-derived it from a heuristic. The guard below makes this a true one-time
-- backfill: it runs only when the column was just added (some INCREASE lot still has a NULL
-- remainingQuantity) and is skipped entirely once every lot has a value.
DO $$
DECLARE
  item RECORD;
  lot RECORD;
  remaining_stock INT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM "InventoryAdjustment" WHERE type = 'INCREASE' AND "remainingQuantity" IS NULL
  ) THEN
    RAISE NOTICE 'FIFO remainingQuantity already backfilled — skipping recompute (replay-safe).';
    RETURN;
  END IF;

  -- First, set all INCREASE lots to remainingQuantity = 0
  UPDATE "InventoryAdjustment" SET "remainingQuantity" = 0 WHERE type = 'INCREASE';

  -- For each active inventory item with stock
  FOR item IN
    SELECT id, quantity FROM "InventoryItem" WHERE "isActive" = true AND quantity > 0
  LOOP
    remaining_stock := item.quantity;

    -- Walk lots from NEWEST to OLDEST, allocating remaining stock
    FOR lot IN
      SELECT id, "quantityChange"
      FROM "InventoryAdjustment"
      WHERE "itemId" = item.id AND type = 'INCREASE'
      ORDER BY "adjustmentDate" DESC, "createdAt" DESC
    LOOP
      IF remaining_stock <= 0 THEN
        EXIT;
      END IF;

      IF remaining_stock >= lot."quantityChange" THEN
        UPDATE "InventoryAdjustment" SET "remainingQuantity" = lot."quantityChange" WHERE id = lot.id;
        remaining_stock := remaining_stock - lot."quantityChange";
      ELSE
        UPDATE "InventoryAdjustment" SET "remainingQuantity" = remaining_stock WHERE id = lot.id;
        remaining_stock := 0;
      END IF;
    END LOOP;
  END LOOP;
END $$;
