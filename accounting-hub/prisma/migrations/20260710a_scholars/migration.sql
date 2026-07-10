-- Scholars: award terms for approved fellowship scholars + monthly releases.
CREATE TABLE IF NOT EXISTS "ScholarAward" (
  "id" TEXT NOT NULL,
  "portalScholarId" TEXT NOT NULL,
  "scholarName" TEXT NOT NULL,
  "school" TEXT,
  "email" TEXT,
  "academicYear" TEXT,
  "scholarshipType" TEXT,
  "amountAwarded" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "monthlyAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "startMonth" TEXT,
  "releaseDay" INTEGER,
  "numberOfMonths" INTEGER,
  "signedRsaUrls" JSONB,
  "bankAccountId" TEXT,
  "expenseAccountId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScholarAward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScholarAward_portalScholarId_key" ON "ScholarAward"("portalScholarId");
CREATE INDEX IF NOT EXISTS "ScholarAward_academicYear_idx" ON "ScholarAward"("academicYear");
CREATE INDEX IF NOT EXISTS "ScholarAward_school_idx" ON "ScholarAward"("school");

CREATE TABLE IF NOT EXISTS "ScholarRelease" (
  "id" TEXT NOT NULL,
  "awardId" TEXT NOT NULL,
  "monthKey" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "bankAccountId" TEXT,
  "expenseAccountId" TEXT,
  "journalEntryId" TEXT,
  "proofOfDepositUrls" JSONB,
  "emailedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScholarRelease_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScholarRelease_awardId_monthKey_key" ON "ScholarRelease"("awardId", "monthKey");
CREATE INDEX IF NOT EXISTS "ScholarRelease_awardId_idx" ON "ScholarRelease"("awardId");
CREATE INDEX IF NOT EXISTS "ScholarRelease_monthKey_idx" ON "ScholarRelease"("monthKey");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ScholarRelease_awardId_fkey') THEN
    ALTER TABLE "ScholarRelease" ADD CONSTRAINT "ScholarRelease_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "ScholarAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
