-- Live checkout mirrored to the branch's patient tablet. One row per branch,
-- overwritten in place. Idempotent so it can be re-applied on every deploy.
CREATE TABLE IF NOT EXISTS "PatientViewCheckout" (
  "id"          TEXT NOT NULL,
  "branch"      TEXT NOT NULL,
  "active"      BOOLEAN NOT NULL DEFAULT true,
  "payload"     JSONB NOT NULL,
  "scannedCode" TEXT,
  "scannedAt"   TIMESTAMP(3),
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientViewCheckout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PatientViewCheckout_branch_key" ON "PatientViewCheckout"("branch");
CREATE INDEX IF NOT EXISTS "PatientViewCheckout_active_idx" ON "PatientViewCheckout"("active");
