-- POS Schema Migration: Align DB tables with Prisma schema
-- Run this on accounting_db to fix column mismatches

-- ══════════════════════════════════════════════════════════════
-- 1. WalletLog — rename note→description, points→pointsChange, drop amount, add balanceBefore/balanceAfter
-- ══════════════════════════════════════════════════════════════

-- Rename 'note' to 'description' (if 'note' exists)
DO $$ BEGIN
  ALTER TABLE "WalletLog" RENAME COLUMN "note" TO "description";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Rename 'points' to 'pointsChange' (if 'points' exists)
DO $$ BEGIN
  ALTER TABLE "WalletLog" RENAME COLUMN "points" TO "pointsChange";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Drop 'amount' column (not in Prisma schema)
DO $$ BEGIN
  ALTER TABLE "WalletLog" DROP COLUMN "amount";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Add balanceBefore and balanceAfter
DO $$ BEGIN
  ALTER TABLE "WalletLog" ADD COLUMN "balanceBefore" INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "WalletLog" ADD COLUMN "balanceAfter" INTEGER;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Ensure description is NOT NULL (set default for existing rows)
UPDATE "WalletLog" SET "description" = '' WHERE "description" IS NULL;
ALTER TABLE "WalletLog" ALTER COLUMN "description" SET NOT NULL;
ALTER TABLE "WalletLog" ALTER COLUMN "description" SET DEFAULT '';

-- ══════════════════════════════════════════════════════════════
-- 2. DigitalWallet — drop createdById FK, make patientId unique + NOT NULL
-- ══════════════════════════════════════════════════════════════

-- Drop the FK constraint and column for createdById (not in Prisma schema)
DO $$ BEGIN
  ALTER TABLE "DigitalWallet" DROP CONSTRAINT "DigitalWallet_createdById_fkey";
EXCEPTION WHEN undefined_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DigitalWallet" DROP COLUMN "createdById";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

DROP INDEX IF EXISTS "DigitalWallet_createdById_idx";

-- Make patientId NOT NULL and add unique constraint
UPDATE "DigitalWallet" SET "patientId" = "id" WHERE "patientId" IS NULL;
ALTER TABLE "DigitalWallet" ALTER COLUMN "patientId" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "DigitalWallet_patientId_key" ON "DigitalWallet"("patientId");

-- ══════════════════════════════════════════════════════════════
-- 3. Order — major column restructure to match Prisma
-- ══════════════════════════════════════════════════════════════

-- Rename doctorName → clinicianName
DO $$ BEGIN
  ALTER TABLE "Order" RENAME COLUMN "doctorName" TO "clinicianName";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Rename total → netAmount
DO $$ BEGIN
  ALTER TABLE "Order" RENAME COLUMN "total" TO "netAmount";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Add patientId column (nullable string)
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "patientId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add discountLabel column
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "discountLabel" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add revenueType column (string, default 'EARNED')
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "revenueType" TEXT NOT NULL DEFAULT 'EARNED';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Add transactionDate column
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "transactionDate" TIMESTAMP(3);
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
-- Backfill transactionDate from createdAt for existing rows
UPDATE "Order" SET "transactionDate" = "createdAt" WHERE "transactionDate" IS NULL;
ALTER TABLE "Order" ALTER COLUMN "transactionDate" SET NOT NULL;

-- Change branch column type from "Branch" enum to TEXT
ALTER TABLE "Order" ALTER COLUMN "branch" TYPE TEXT;

-- Make patientName nullable (Prisma schema has it as String?)
ALTER TABLE "Order" ALTER COLUMN "patientName" DROP NOT NULL;

-- Drop columns not in Prisma schema
DO $$ BEGIN ALTER TABLE "Order" DROP COLUMN "patientEmail"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Order" DROP CONSTRAINT "Order_walletId_fkey"; EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Order" DROP COLUMN "walletId"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Order" DROP CONSTRAINT "Order_voidedById_fkey"; EXCEPTION WHEN undefined_object THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Order" DROP COLUMN "voidedById"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Order" DROP COLUMN "voidedAt"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "Order" DROP COLUMN "voidReason"; EXCEPTION WHEN undefined_column THEN NULL; END $$;

DROP INDEX IF EXISTS "Order_walletId_idx";

-- Add missing indexes
CREATE INDEX IF NOT EXISTS "Order_orderType_idx" ON "Order"("orderType");
CREATE INDEX IF NOT EXISTS "Order_transactionDate_idx" ON "Order"("transactionDate");

-- ══════════════════════════════════════════════════════════════
-- 4. OrderItem — drop doctorFee, clinicFee (not in Prisma schema)
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN ALTER TABLE "OrderItem" DROP COLUMN "doctorFee"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "OrderItem" DROP COLUMN "clinicFee"; EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
-- 5. OrderPayment — add walletId FK
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE "OrderPayment" ADD COLUMN "walletId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "OrderPayment" ADD CONSTRAINT "OrderPayment_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "DigitalWallet"("id") ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "OrderPayment_walletId_idx" ON "OrderPayment"("walletId");

-- ══════════════════════════════════════════════════════════════
-- 6. DiscountSetting — restructure to match Prisma schema
-- ══════════════════════════════════════════════════════════════

-- Drop the old unique index on discountType
DROP INDEX IF EXISTS "DiscountSetting_discountType_key";

-- Rename columns to match Prisma
DO $$ BEGIN ALTER TABLE "DiscountSetting" RENAME COLUMN "discountType" TO "type"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DiscountSetting" RENAME COLUMN "label" TO "name"; EXCEPTION WHEN undefined_column THEN NULL; END $$;
DO $$ BEGIN ALTER TABLE "DiscountSetting" RENAME COLUMN "percentage" TO "value"; EXCEPTION WHEN undefined_column THEN NULL; END $$;

-- Change type column from DiscountType enum to TEXT
ALTER TABLE "DiscountSetting" ALTER COLUMN "type" TYPE TEXT;
ALTER TABLE "DiscountSetting" ALTER COLUMN "type" SET DEFAULT 'PERCENTAGE';

-- Add missing columns
DO $$ BEGIN
  ALTER TABLE "DiscountSetting" ADD COLUMN "branch" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "DiscountSetting" ADD COLUMN "createdById" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Set createdById to admin for existing rows
UPDATE "DiscountSetting" SET "createdById" = (SELECT "id" FROM "User" WHERE "role" = 'ADMIN' LIMIT 1) WHERE "createdById" IS NULL;
ALTER TABLE "DiscountSetting" ALTER COLUMN "createdById" SET NOT NULL;

DO $$ BEGIN
  ALTER TABLE "DiscountSetting" ADD CONSTRAINT "DiscountSetting_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Add indexes matching Prisma schema
CREATE INDEX IF NOT EXISTS "DiscountSetting_isActive_idx" ON "DiscountSetting"("isActive");
CREATE INDEX IF NOT EXISTS "DiscountSetting_branch_idx" ON "DiscountSetting"("branch");

-- ══════════════════════════════════════════════════════════════
-- 7. WalletPackage — add purchaseDate, drop updatedAt
-- ══════════════════════════════════════════════════════════════

DO $$ BEGIN
  ALTER TABLE "WalletPackage" ADD COLUMN "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- updatedAt is in the SQL but NOT in Prisma — drop it
DO $$ BEGIN
  ALTER TABLE "WalletPackage" DROP COLUMN "updatedAt";
EXCEPTION WHEN undefined_column THEN NULL;
END $$;

-- Done!
