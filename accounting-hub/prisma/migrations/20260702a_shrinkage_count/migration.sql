ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "countedQuantity" INTEGER;
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "auditorName" TEXT;
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "auditorSignature" TEXT;
