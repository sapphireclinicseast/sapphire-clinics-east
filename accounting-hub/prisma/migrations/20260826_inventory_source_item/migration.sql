-- Branch consignment copies link back to their pool item so checkout/receive
-- can find them without guessing at SKU suffixes.
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "sourceItemId" TEXT;
CREATE INDEX IF NOT EXISTS "InventoryItem_sourceItemId_idx" ON "InventoryItem"("sourceItemId");
