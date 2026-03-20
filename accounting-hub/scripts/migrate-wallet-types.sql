-- Migration: Add WalletType enum and update DigitalWallet model
-- This migration is fully idempotent and safe to run multiple times.

-- 1. Create the WalletType enum
DO $$ BEGIN
  CREATE TYPE "WalletType" AS ENUM ('PACKAGE', 'VIP', 'PREPAID_CARD', 'DOWNPAYMENT', 'ADVANCE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add walletType column with default for existing rows, then remove default
DO $$ BEGIN
  ALTER TABLE "DigitalWallet" ADD COLUMN "walletType" "WalletType";
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Set existing rows to PACKAGE if walletType is null
UPDATE "DigitalWallet" SET "walletType" = 'PACKAGE' WHERE "walletType" IS NULL;

-- Make the column NOT NULL
ALTER TABLE "DigitalWallet" ALTER COLUMN "walletType" SET NOT NULL;

-- 3. Add balance column
DO $$ BEGIN
  ALTER TABLE "DigitalWallet" ADD COLUMN "balance" DECIMAL NOT NULL DEFAULT 0;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- 4. Drop the old unique index on patientId alone
DROP INDEX IF EXISTS "DigitalWallet_patientId_key";

-- 5. Create compound unique index on (patientId, walletType)
CREATE UNIQUE INDEX IF NOT EXISTS "DigitalWallet_patientId_walletType_key"
  ON "DigitalWallet"("patientId", "walletType");

-- 6. Create index on walletType
CREATE INDEX IF NOT EXISTS "DigitalWallet_walletType_idx"
  ON "DigitalWallet"("walletType");
