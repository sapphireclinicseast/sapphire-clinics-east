CREATE TABLE IF NOT EXISTS "CashAdvance" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "refNumber" TEXT NOT NULL,
  "refSeq" INTEGER NOT NULL,
  "accountableName" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "dateReleased" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "sourceAccountId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashAdvance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CashAdvance_branch_refNumber_key" ON "CashAdvance"("branch","refNumber");
CREATE INDEX IF NOT EXISTS "CashAdvance_branch_idx" ON "CashAdvance"("branch");
CREATE TABLE IF NOT EXISTS "CashAdvanceLine" (
  "id" TEXT NOT NULL,
  "advanceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "accountTitle" TEXT,
  "description" TEXT,
  "vatable" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "siNumber" TEXT,
  "registeredName" TEXT,
  "proofUrl" TEXT,
  "proofUrls" JSONB,
  "bankAccountId" TEXT,
  "journalEntryId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashAdvanceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CashAdvanceLine_advanceId_idx" ON "CashAdvanceLine"("advanceId");
DO $$ BEGIN
  ALTER TABLE "CashAdvanceLine" ADD CONSTRAINT "CashAdvanceLine_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "CashAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
