-- Scanned deposit slips / sales proofs per day+branch: [{ url, name?, note? }].
-- A deposit covering several days is attached to each covered day with a note.
ALTER TABLE "SalesDayClearing" ADD COLUMN IF NOT EXISTS "proofUrls" JSONB;
