-- AlterTable: add bank details to Staff
-- Synced from HR Platform staff profiles

ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "bankName" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "bankAccountNo" TEXT;
