CREATE TABLE IF NOT EXISTS "CreditCardSOA" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "refNumber" TEXT NOT NULL,
  "refSeq" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "paymentRoute" TEXT,
  "statementUrl" TEXT,
  "soaDocUrl" TEXT,
  "reimbursementId" TEXT,
  "pettyCashEntryId" TEXT,
  "filingStatus" TEXT NOT NULL DEFAULT 'FOR_FILING',
  "paidAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditCardSOA_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CreditCardSOA_branch_refNumber_key" ON "CreditCardSOA"("branch","refNumber");
CREATE INDEX IF NOT EXISTS "CreditCardSOA_branch_idx" ON "CreditCardSOA"("branch");
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "soaId" TEXT;
