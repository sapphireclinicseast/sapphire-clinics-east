-- Batches of sessions submitted to an HMO for evaluation, with the paper trail
-- proving transmittal. Written idempotently because the deploy replays every
-- migration.sql on each run.
CREATE TABLE IF NOT EXISTS "SoaSubmission" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "submittedDate" TIMESTAMP(3) NOT NULL,
  "transmittalUrls" JSONB,
  "documentUrls" JSONB,
  "notes" TEXT,
  "branch" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SoaSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SoaSubmission_walletId_idx" ON "SoaSubmission"("walletId");
CREATE INDEX IF NOT EXISTS "SoaSubmission_submittedDate_idx" ON "SoaSubmission"("submittedDate");

CREATE TABLE IF NOT EXISTS "SoaSubmissionItem" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SoaSubmissionItem_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SoaSubmissionItem_submissionId_orderId_key"
  ON "SoaSubmissionItem"("submissionId", "orderId");
CREATE INDEX IF NOT EXISTS "SoaSubmissionItem_submissionId_idx" ON "SoaSubmissionItem"("submissionId");
CREATE INDEX IF NOT EXISTS "SoaSubmissionItem_orderId_idx" ON "SoaSubmissionItem"("orderId");

-- Foreign keys are added separately so a replay on a database that already has
-- them fails only this statement (ON_ERROR_STOP=0) rather than the whole file.
DO $$ BEGIN
  ALTER TABLE "SoaSubmission" ADD CONSTRAINT "SoaSubmission_walletId_fkey"
    FOREIGN KEY ("walletId") REFERENCES "DigitalWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SoaSubmission" ADD CONSTRAINT "SoaSubmission_createdById_fkey"
    FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SoaSubmissionItem" ADD CONSTRAINT "SoaSubmissionItem_submissionId_fkey"
    FOREIGN KEY ("submissionId") REFERENCES "SoaSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SoaSubmissionItem" ADD CONSTRAINT "SoaSubmissionItem_orderId_fkey"
    FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
