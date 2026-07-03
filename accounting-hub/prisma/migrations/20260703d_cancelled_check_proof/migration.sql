-- Scanned image(s) of a cancelled check
ALTER TABLE "CancelledCheck" ADD COLUMN IF NOT EXISTS "proofUrls" JSONB;
