-- Add rewardPointsPrice column to InventoryItem
DO $$ BEGIN
  ALTER TABLE "InventoryItem" ADD COLUMN "rewardPointsPrice" INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
