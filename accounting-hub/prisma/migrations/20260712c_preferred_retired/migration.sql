-- Retired/redeemed preferred shares count per holding.
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "retiredShares" DECIMAL(65,30) DEFAULT 0;
