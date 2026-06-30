-- Beginning-balance start date (bank-rec cutover).
ALTER TABLE "BeginningBalance" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);

-- Bank Reconciliation: imported/keyed bank statement lines.
CREATE TABLE IF NOT EXISTS "BankTransaction" (
  "id" TEXT NOT NULL,
  "bankAccountId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "spent" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "received" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "fromToName" TEXT,
  "categoryAccountId" TEXT,
  "matchType" TEXT,
  "matchId" TEXT,
  "matchLabel" TEXT,
  "journalEntryId" TEXT,
  "note" TEXT,
  "proofUrl" TEXT,
  "importBatch" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankTransaction_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BankTransaction_bankAccountId_status_idx" ON "BankTransaction"("bankAccountId", "status");
CREATE INDEX IF NOT EXISTS "BankTransaction_date_idx" ON "BankTransaction"("date");
