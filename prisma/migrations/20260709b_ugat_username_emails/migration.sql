-- UGAT Fellowship revision: sign-in by username; capture professional +
-- personal email instead of a single email.
-- Idempotent (replayed every deploy with ON_ERROR_STOP=0).

-- 1. Add the new columns (nullable first so the ALTER succeeds on a table
--    that may already hold rows from the initial deploy).
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "username" TEXT;
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "professionalEmail" TEXT;
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "personalEmail" TEXT;

-- 2. Backfill any pre-existing real rows (none expected beyond disposable
--    smoke tests) so the NOT NULL constraints below can be applied.
UPDATE "UgatScholar" SET "personalEmail" = "email"
  WHERE "personalEmail" IS NULL AND "email" IS NOT NULL;
UPDATE "UgatScholar" SET "professionalEmail" = "email"
  WHERE "professionalEmail" IS NULL AND "email" IS NOT NULL;

-- 3. Drop the disposable smoke-test row(s) from the initial deploy, and any
--    row that still lacks a username (can't satisfy the new NOT NULL).
DELETE FROM "UgatScholar" WHERE "username" IS NULL;

-- 4. Enforce NOT NULL + unique username (safe: no NULL rows remain).
ALTER TABLE "UgatScholar" ALTER COLUMN "username" SET NOT NULL;
ALTER TABLE "UgatScholar" ALTER COLUMN "professionalEmail" SET NOT NULL;
ALTER TABLE "UgatScholar" ALTER COLUMN "personalEmail" SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "UgatScholar_username_key" ON "UgatScholar" ("username");

-- 5. Retire the old single-email column + its unique index.
DROP INDEX IF EXISTS "UgatScholar_email_key";
ALTER TABLE "UgatScholar" DROP COLUMN IF EXISTS "email";
