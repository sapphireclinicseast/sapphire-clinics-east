-- Add cost tracking columns to InventoryAdjustment for bulk imports
DO $$ BEGIN ALTER TABLE "InventoryAdjustment" ADD COLUMN "batchId" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryAdjustment" ADD COLUMN "foreignCost" DECIMAL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryAdjustment" ADD COLUMN "foreignCurrency" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryAdjustment" ADD COLUMN "exchangeRate" DECIMAL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryAdjustment" ADD COLUMN "localCost" DECIMAL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryAdjustment" ADD COLUMN "freightAllocation" DECIMAL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "InventoryAdjustment" ADD COLUMN "totalLandedCost" DECIMAL; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "InventoryAdjustment_batchId_idx" ON "InventoryAdjustment"("batchId");
