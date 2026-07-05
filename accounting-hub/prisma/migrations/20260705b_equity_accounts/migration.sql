ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "equityAccountId" TEXT;
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "treasuryAccountId" TEXT;
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "equityAccountId" TEXT;
