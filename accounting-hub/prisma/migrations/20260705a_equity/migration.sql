CREATE TABLE IF NOT EXISTS "Shareholder" (
  "id" TEXT NOT NULL, "shNumber" TEXT NOT NULL, "shSeq" INTEGER NOT NULL,
  "name" TEXT NOT NULL, "tin" TEXT, "birthdate" TIMESTAMP(3), "email" TEXT, "address" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shareholder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Shareholder_shNumber_key" ON "Shareholder"("shNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Shareholder_shSeq_key" ON "Shareholder"("shSeq");

CREATE TABLE IF NOT EXISTS "CommonShare" (
  "id" TEXT NOT NULL, "shareholderId" TEXT NOT NULL, "dateAcquired" TIMESTAMP(3) NOT NULL,
  "agreementType" TEXT NOT NULL, "assignedToShareholderId" TEXT, "agreementUrls" JSONB,
  "stockCertNumber" TEXT, "proofOfDepositUrls" JSONB, "numberOfShares" DECIMAL(65,30) NOT NULL,
  "pricePerShare" DECIMAL(65,30) NOT NULL, "bankAccountId" TEXT, "journalEntryId" TEXT,
  "boughtBack" BOOLEAN NOT NULL DEFAULT false, "buybackPrice" DECIMAL(65,30), "buybackShares" DECIMAL(65,30),
  "buybackBankAccountId" TEXT, "buybackProofUrls" JSONB, "buybackJournalEntryId" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommonShare_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommonShare_shareholderId_idx" ON "CommonShare"("shareholderId");

CREATE TABLE IF NOT EXISTS "PreferredShare" (
  "id" TEXT NOT NULL, "shareholderId" TEXT NOT NULL, "dateAcquired" TIMESTAMP(3) NOT NULL,
  "agreementType" TEXT NOT NULL, "agreementUrls" JSONB, "stockCertNumber" TEXT, "proofOfDepositUrls" JSONB,
  "numberOfShares" DECIMAL(65,30) NOT NULL, "pricePerShare" DECIMAL(65,30) NOT NULL,
  "bankAccountId" TEXT, "journalEntryId" TEXT, "annualInterest" DECIMAL(65,30), "maturityYears" INTEGER,
  "buybackPrice" DECIMAL(65,30), "payoutSchedule" TEXT, "payoutStartMonth" INTEGER, "payoutStartYear" INTEGER,
  "payoutDay" INTEGER, "pdcUrls" JSONB, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreferredShare_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredShare_shareholderId_idx" ON "PreferredShare"("shareholderId");

CREATE TABLE IF NOT EXISTS "PreferredPayout" (
  "id" TEXT NOT NULL, "preferredShareId" TEXT NOT NULL, "shareholderId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL, "amount" DECIMAL(65,30) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidDate" TIMESTAMP(3), "bankAccountId" TEXT, "proofUrls" JSONB, "emailedAt" TIMESTAMP(3),
  "journalEntryId" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreferredPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredPayout_preferredShareId_idx" ON "PreferredPayout"("preferredShareId");
CREATE INDEX IF NOT EXISTS "PreferredPayout_dueDate_idx" ON "PreferredPayout"("dueDate");

CREATE TABLE IF NOT EXISTS "DividendRelease" (
  "id" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "boardResolutionUrls" JSONB,
  "dividendAmount" DECIMAL(65,30) NOT NULL, "dividendType" TEXT NOT NULL,
  "totalAmountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "proofOfDepositUrls" JSONB, "journalEntryId" TEXT, "finalizedAt" TIMESTAMP(3), "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DividendRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DividendReleaseItem" (
  "id" TEXT NOT NULL, "releaseId" TEXT NOT NULL, "shareholderId" TEXT NOT NULL,
  "shareholderName" TEXT NOT NULL, "shares" DECIMAL(65,30) NOT NULL, "amount" DECIMAL(65,30) NOT NULL,
  "emailedAt" TIMESTAMP(3), CONSTRAINT "DividendReleaseItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DividendReleaseItem_releaseId_idx" ON "DividendReleaseItem"("releaseId");
DO $$ BEGIN
  ALTER TABLE "CommonShare" ADD CONSTRAINT "CommonShare_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PreferredShare" ADD CONSTRAINT "PreferredShare_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PreferredPayout" ADD CONSTRAINT "PreferredPayout_preferredShareId_fkey" FOREIGN KEY ("preferredShareId") REFERENCES "PreferredShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DividendReleaseItem" ADD CONSTRAINT "DividendReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "DividendRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
