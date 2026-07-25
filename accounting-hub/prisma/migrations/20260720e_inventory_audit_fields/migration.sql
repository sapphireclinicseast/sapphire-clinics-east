ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "auditPeriodFrom" TIMESTAMP(3);
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "auditPeriodTo" TIMESTAMP(3);
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "proofUrls" JSONB;
