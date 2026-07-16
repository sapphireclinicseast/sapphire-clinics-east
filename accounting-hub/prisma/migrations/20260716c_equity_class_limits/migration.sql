-- Per-class authorized-share sub-limits (Common / Founders). Idempotent.
ALTER TABLE "EquitySettings" ADD COLUMN IF NOT EXISTS "authorizedCommonShares" INTEGER;
ALTER TABLE "EquitySettings" ADD COLUMN IF NOT EXISTS "authorizedFounderShares" INTEGER;
