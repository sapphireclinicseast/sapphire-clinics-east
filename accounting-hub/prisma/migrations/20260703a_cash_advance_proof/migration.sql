-- Release proof(s) for cash advances
ALTER TABLE "CashAdvance" ADD COLUMN IF NOT EXISTS "proofUrls" JSONB;
