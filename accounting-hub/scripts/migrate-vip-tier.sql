-- Add vipTier to Service and DigitalWallet
DO $$ BEGIN ALTER TABLE "Service" ADD COLUMN "vipTier" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DigitalWallet" ADD COLUMN "vipTier" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;
