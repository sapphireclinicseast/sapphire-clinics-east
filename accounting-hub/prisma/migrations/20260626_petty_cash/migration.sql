-- Petty Cash module: entries, reimbursement reports, per-branch settings

CREATE TABLE IF NOT EXISTS "ReimbursementReport" (
  "id"             TEXT          NOT NULL,
  "branch"         TEXT          NOT NULL,
  "refNumber"      TEXT          NOT NULL,
  "refSeq"         INTEGER       NOT NULL,
  "grossTotal"     DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status"         TEXT          NOT NULL DEFAULT 'PENDING',
  "pdfData"        TEXT,
  "paidAt"         TIMESTAMP(3),
  "debitAccount"   TEXT,
  "depositAccount" TEXT,
  "proofUrl"       TEXT,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReimbursementReport_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ReimbursementReport_branch_refNumber_key" ON "ReimbursementReport"("branch","refNumber");
CREATE INDEX IF NOT EXISTS "ReimbursementReport_branch_idx" ON "ReimbursementReport"("branch");

CREATE TABLE IF NOT EXISTS "PettyCashEntry" (
  "id"                TEXT          NOT NULL,
  "branch"            TEXT          NOT NULL,
  "pcvNumber"         TEXT          NOT NULL,
  "pcvSeq"            INTEGER       NOT NULL,
  "requestor"         TEXT,
  "department"        TEXT,
  "pcfStatus"         TEXT,
  "date"              TIMESTAMP(3),
  "description"       TEXT,
  "vatable"           TEXT,
  "siNumber"          TEXT,
  "tinNumber"         TEXT,
  "registeredName"    TEXT,
  "registeredAddress" TEXT,
  "grossAmount"       DECIMAL(65,30) NOT NULL DEFAULT 0,
  "accountTitle"      TEXT,
  "referenceNumber"   TEXT,
  "reimbursementId"   TEXT,
  "createdById"       TEXT,
  "createdAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PettyCashEntry_branch_pcvNumber_key" ON "PettyCashEntry"("branch","pcvNumber");
CREATE INDEX IF NOT EXISTS "PettyCashEntry_branch_idx" ON "PettyCashEntry"("branch");
CREATE INDEX IF NOT EXISTS "PettyCashEntry_reimbursementId_idx" ON "PettyCashEntry"("reimbursementId");

-- FK (guarded so re-running the migration doesn't error)
DO $$ BEGIN
  ALTER TABLE "PettyCashEntry"
    ADD CONSTRAINT "PettyCashEntry_reimbursementId_fkey"
    FOREIGN KEY ("reimbursementId") REFERENCES "ReimbursementReport"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "PettyCashSettings" (
  "branch"     TEXT          NOT NULL,
  "nextPcvSeq" INTEGER       NOT NULL DEFAULT 1,
  "requestors" JSONB         NOT NULL DEFAULT '[]',
  "updatedAt"  TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PettyCashSettings_pkey" PRIMARY KEY ("branch")
);
