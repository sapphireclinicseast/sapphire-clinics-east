-- Display-only per-branch stock split for consigned inventory.
-- `quantity` stays the authoritative TOTAL used by FIFO/COGS/Balance Sheet;
-- `branchStock` records where those units physically sit (e.g. Sandbox Greenhills),
-- replacing the retired '<sku>-SAND' consignment rows. Nullable/additive → safe.
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "branchStock" JSONB;
