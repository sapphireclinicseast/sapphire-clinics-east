-- Add referenceNumber to ConsignmentTransfer for batch transfers
DO $$ BEGIN
  ALTER TABLE "ConsignmentTransfer" ADD COLUMN "referenceNumber" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "ConsignmentTransfer_referenceNumber_idx" ON "ConsignmentTransfer"("referenceNumber");
