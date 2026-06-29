ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "recordType" TEXT NOT NULL DEFAULT 'PETTY_CASH';
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "checkNumber" TEXT;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "creditCard" TEXT;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "payrollAccount" TEXT;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "paymentBankAccount" TEXT;
CREATE INDEX IF NOT EXISTS "PettyCashEntry_recordType_idx" ON "PettyCashEntry"("recordType");
CREATE TABLE IF NOT EXISTS "CreditCard" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "bank" TEXT NOT NULL,
  "cardNumber" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CreditCard_branch_idx" ON "CreditCard"("branch");
