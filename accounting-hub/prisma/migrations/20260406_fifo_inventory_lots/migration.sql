-- FIFO Inventory Lots: track remaining quantity per purchase lot
-- + Expense Account linking for COGS classification
-- + cogsCost on OrderItem for accurate FIFO-based COGS

-- 1. Add remainingQuantity to InventoryAdjustment (FIFO lot tracking)
ALTER TABLE "InventoryAdjustment" ADD COLUMN "remainingQuantity" INTEGER;

-- 2. Add expenseAccountId to InventoryItem (COGS account)
ALTER TABLE "InventoryItem" ADD COLUMN "expenseAccountId" TEXT;
ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_expenseAccountId_fkey"
  FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "InventoryItem_expenseAccountId_idx" ON "InventoryItem"("expenseAccountId");

-- 3. Add cogsCost to OrderItem (FIFO cost recorded at order time)
ALTER TABLE "OrderItem" ADD COLUMN "cogsCost" DECIMAL;

-- 4. Backfill remainingQuantity for existing INCREASE lots
-- Strategy: for each item, allocate current on-hand quantity to lots newest-first
-- (since oldest lots would have been consumed first under FIFO)
DO $$
DECLARE
  item RECORD;
  lot RECORD;
  remaining_stock INT;
BEGIN
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
