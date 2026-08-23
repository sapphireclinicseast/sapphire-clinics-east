-- Detailed GL entries that accounting can create before POS has a wallet.
--
-- A Guarantee Letter often exists on paper well before it exists in POS — a
-- second application filed while the first is still running, or a letter still
-- awaiting approval. Until now every Detailed GL row had to be a DigitalWallet,
-- so those letters had nowhere to live and stayed in the spreadsheet.
--
-- "walletId" is UNIQUE: a wallet backs at most one case. Detailed GL renders
-- every case plus the wallets no case has claimed, so tagging a case to a wallet
-- replaces that wallet's row instead of duplicating it.
CREATE TABLE IF NOT EXISTS "GlCase" (
  "id"                TEXT NOT NULL,
  "walletId"          TEXT,
  "patientName"       TEXT NOT NULL,
  "branch"            TEXT NOT NULL DEFAULT 'ALL',
  "glRequestedAmount" DECIMAL(65,30),
  "glDocsSubmittedAt" TIMESTAMP(3),
  "glReleasedAt"      TIMESTAMP(3),
  "approvedAmount"    DECIMAL(65,30),
  "soaAmount"         DECIMAL(65,30),
  "soaSubmittedAt"    TIMESTAMP(3),
  "guardianName"      TEXT,
  "soaCommissionRate" DECIMAL(65,30),
  "payoutBatch"       TEXT,
  "qbEntry"           TEXT,
  "paidAt"            TIMESTAMP(3),
  "notes"             TEXT,
  "createdById"       TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  CONSTRAINT "GlCase_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "GlCase_walletId_key"  ON "GlCase"("walletId");
CREATE INDEX        IF NOT EXISTS "GlCase_patientName_idx" ON "GlCase"("patientName");
CREATE INDEX        IF NOT EXISTS "GlCase_branch_idx"      ON "GlCase"("branch");

-- Untagging a deleted wallet must not delete the paper trail with it.
ALTER TABLE "GlCase" DROP CONSTRAINT IF EXISTS "GlCase_walletId_fkey";
ALTER TABLE "GlCase" ADD CONSTRAINT "GlCase_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "DigitalWallet"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "GlCase" DROP CONSTRAINT IF EXISTS "GlCase_createdById_fkey";
ALTER TABLE "GlCase" ADD CONSTRAINT "GlCase_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
