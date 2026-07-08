-- Share class / type (e.g. "Common – Voting – with Par", "Preferred – Non-Voting – with Par").
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "shareClass" TEXT;
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "shareClass" TEXT;
