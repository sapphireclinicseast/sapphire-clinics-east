-- GL processor payout: which RFP settled a letter's processor fee, when, and the
-- proof of remittance. Nullable so existing cases stay valid; the FK is SET NULL
-- so deleting an RFP unlocks its cases for a fresh batch rather than orphaning them.
ALTER TABLE "GlCase" ADD COLUMN IF NOT EXISTS "processorRfpId" TEXT;
ALTER TABLE "GlCase" ADD COLUMN IF NOT EXISTS "processorPaidAt" TIMESTAMP(3);
ALTER TABLE "GlCase" ADD COLUMN IF NOT EXISTS "processorProofUrl" TEXT;

CREATE INDEX IF NOT EXISTS "GlCase_processorRfpId_idx" ON "GlCase"("processorRfpId");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'GlCase_processorRfpId_fkey'
  ) THEN
    ALTER TABLE "GlCase"
      ADD CONSTRAINT "GlCase_processorRfpId_fkey"
      FOREIGN KEY ("processorRfpId") REFERENCES "ReimbursementReport"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
