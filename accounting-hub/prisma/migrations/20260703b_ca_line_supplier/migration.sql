-- Expense-entry parity fields on cash advance liquidation lines
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "requestor" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "validity" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "tinNumber" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "registeredAddress" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "hasEwt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "ewtRate" INTEGER;
