-- Bank-account flag on Chart of Accounts (current-asset accounts).
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "isBankAccount" BOOLEAN NOT NULL DEFAULT false;

-- Fund Transfer module (transfers between bank accounts).
CREATE TABLE IF NOT EXISTS "FundTransfer" (
  "id" TEXT NOT NULL,
  "refNumber" TEXT NOT NULL,
  "refSeq" INTEGER NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "fromAccountId" TEXT NOT NULL,
  "toAccountId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "checkNumber" TEXT,
  "description" TEXT,
  "proofUrl" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FundTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "FundTransfer_refNumber_key" ON "FundTransfer"("refNumber");
CREATE INDEX IF NOT EXISTS "FundTransfer_date_idx" ON "FundTransfer"("date");

CREATE TABLE IF NOT EXISTS "FundTransferSettings" (
  "id" TEXT NOT NULL DEFAULT 'singleton',
  "nextSeq" INTEGER NOT NULL DEFAULT 1,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FundTransferSettings_pkey" PRIMARY KEY ("id")
);
