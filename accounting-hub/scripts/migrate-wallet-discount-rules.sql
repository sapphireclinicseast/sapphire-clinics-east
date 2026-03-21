-- Migration: Add walletType to DiscountSetting and create WalletDiscountRule table
-- Idempotent: safe to run multiple times

-- 1. Add walletType column to DiscountSetting
DO $$ BEGIN
  ALTER TABLE "DiscountSetting" ADD COLUMN "walletType" TEXT;
EXCEPTION
  WHEN duplicate_column THEN NULL;
END $$;

-- 2. Create index on DiscountSetting.walletType
DO $$ BEGIN
  CREATE INDEX "DiscountSetting_walletType_idx" ON "DiscountSetting" ("walletType");
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- 3. Create WalletDiscountRule table
DO $$ BEGIN
  CREATE TABLE "WalletDiscountRule" (
    "id" TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    "discountSettingId" TEXT NOT NULL,
    "serviceId" TEXT,
    "department" TEXT,
    "discountPercent" DECIMAL NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WalletDiscountRule_discountSettingId_fkey"
      FOREIGN KEY ("discountSettingId") REFERENCES "DiscountSetting"("id") ON DELETE CASCADE,

    CONSTRAINT "WalletDiscountRule_serviceId_fkey"
      FOREIGN KEY ("serviceId") REFERENCES "Service"("id")
  );
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

-- 4. Create indexes on WalletDiscountRule
DO $$ BEGIN
  CREATE INDEX "WalletDiscountRule_discountSettingId_idx" ON "WalletDiscountRule" ("discountSettingId");
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "WalletDiscountRule_serviceId_idx" ON "WalletDiscountRule" ("serviceId");
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;

DO $$ BEGIN
  CREATE INDEX "WalletDiscountRule_department_idx" ON "WalletDiscountRule" ("department");
EXCEPTION
  WHEN duplicate_table THEN NULL;
END $$;
