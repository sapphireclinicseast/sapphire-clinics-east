-- Add walletType and packageSessions to Service model
DO $$ BEGIN
  ALTER TABLE "Service" ADD COLUMN "walletType" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "Service" ADD COLUMN "packageSessions" INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Service_walletType_idx" ON "Service"("walletType");
