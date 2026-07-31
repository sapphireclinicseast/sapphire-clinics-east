-- Whether an asset can actually be audited. A downpayment or part-payment is a
-- balance, not an object anyone can stand in front of and verify, so it stays on
-- the books but out of the count.
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "auditable" BOOLEAN NOT NULL DEFAULT true;
