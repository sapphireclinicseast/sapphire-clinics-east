-- Rename color → variantLabel, add variantType
DO $$ BEGIN
  ALTER TABLE "InventoryVariant" RENAME COLUMN "color" TO "variantLabel";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "InventoryVariant" ADD COLUMN "variantType" TEXT NOT NULL DEFAULT 'Color';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Update indexes
DROP INDEX IF EXISTS "InventoryVariant_color_idx";
CREATE INDEX IF NOT EXISTS "InventoryVariant_variantType_idx" ON "InventoryVariant"("variantType");
CREATE INDEX IF NOT EXISTS "InventoryVariant_variantLabel_idx" ON "InventoryVariant"("variantLabel");
