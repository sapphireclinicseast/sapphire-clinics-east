CREATE TABLE IF NOT EXISTS "Advance" (
  "id" TEXT NOT NULL, "shareholderId" TEXT, "name" TEXT NOT NULL, "dateAcquired" TIMESTAMP(3) NOT NULL,
  "advanceType" TEXT NOT NULL, "kindType" TEXT, "principalAmount" DECIMAL(65,30) NOT NULL,
  "hasInterest" BOOLEAN NOT NULL DEFAULT false, "interestMode" TEXT, "annualPct" DECIMAL(65,30), "termMonths" INTEGER,
  "monthlyAmortization" DECIMAL(65,30), "computedAnnualPct" DECIMAL(65,30), "totalInterest" DECIMAL(65,30),
  "proofOfDepositUrls" JSONB, "bankAccountId" TEXT, "creditAccountId" TEXT, "interestExpenseAccountId" TEXT,
  "payoutSchedule" TEXT, "payoutStartMonth" INTEGER, "payoutStartYear" INTEGER, "payoutDay" INTEGER,
  "pdcUrls" JSONB, "remarks" TEXT, "journalEntryId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Advance_shareholderId_idx" ON "Advance"("shareholderId");
CREATE TABLE IF NOT EXISTS "AdvancePayout" (
  "id" TEXT NOT NULL, "advanceId" TEXT NOT NULL, "dueDate" TIMESTAMP(3) NOT NULL,
  "principalPortion" DECIMAL(65,30) NOT NULL DEFAULT 0, "interestPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount" DECIMAL(65,30) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "paidDate" TIMESTAMP(3),
  "bankAccountId" TEXT, "proofUrls" JSONB, "emailedAt" TIMESTAMP(3), "journalEntryId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvancePayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdvancePayout_advanceId_idx" ON "AdvancePayout"("advanceId");
CREATE INDEX IF NOT EXISTS "AdvancePayout_dueDate_idx" ON "AdvancePayout"("dueDate");
DO $$ BEGIN
  ALTER TABLE "AdvancePayout" ADD CONSTRAINT "AdvancePayout_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "Advance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
