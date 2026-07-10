-- UGAT: Aral Track award tier (monthly stipend × duration in months), chosen
-- by an admin at acceptance and reflected in the Return Service Agreement.
-- Idempotent (replayed on every deploy).
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "awardMonthly" INTEGER;
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "awardMonths" INTEGER;
