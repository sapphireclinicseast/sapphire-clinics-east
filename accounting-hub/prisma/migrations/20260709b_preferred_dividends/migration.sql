-- Preferred-share dividend (quarterly interest) releases + items.
CREATE TABLE IF NOT EXISTS "PreferredDividendRelease" (
  "id" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "quarterKey" TEXT NOT NULL,
  "periodLabel" TEXT,
  "proofOfDepositUrls" JSONB,
  "bankAccountId" TEXT,
  "expenseAccountId" TEXT,
  "journalEntryId" TEXT,
  "totalAmountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreferredDividendRelease_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredDividendRelease_quarterKey_idx" ON "PreferredDividendRelease"("quarterKey");

CREATE TABLE IF NOT EXISTS "PreferredDividendItem" (
  "id" TEXT NOT NULL,
  "releaseId" TEXT NOT NULL,
  "shareholderId" TEXT NOT NULL,
  "shareholderName" TEXT NOT NULL,
  "shares" DECIMAL(65,30) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "paidDate" TIMESTAMP(3),
  "emailedAt" TIMESTAMP(3),
  CONSTRAINT "PreferredDividendItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredDividendItem_releaseId_idx" ON "PreferredDividendItem"("releaseId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PreferredDividendItem_releaseId_fkey') THEN
    ALTER TABLE "PreferredDividendItem" ADD CONSTRAINT "PreferredDividendItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "PreferredDividendRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
