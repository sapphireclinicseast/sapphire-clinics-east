ALTER TABLE "DividendRelease" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "DividendRelease" ADD COLUMN IF NOT EXISTS "retainedAccountId" TEXT;
