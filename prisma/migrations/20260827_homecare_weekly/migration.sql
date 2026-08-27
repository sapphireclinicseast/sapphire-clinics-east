-- Homecare open days: switch from specific calendar dates to a recurring WEEKLY
-- day-of-week arrangement (e.g. "Antipolo — every Monday from AHEA"). The table
-- is new and empty, so dropping the date column is safe. Idempotent.

DROP INDEX IF EXISTS "HomecareOpenDay_cityId_branch_date_key";
DROP INDEX IF EXISTS "HomecareOpenDay_branch_date_idx";

ALTER TABLE "HomecareOpenDay" ADD COLUMN IF NOT EXISTS "dayOfWeek" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "HomecareOpenDay" DROP COLUMN IF EXISTS "date";

CREATE UNIQUE INDEX IF NOT EXISTS "HomecareOpenDay_cityId_branch_dayOfWeek_key" ON "HomecareOpenDay" ("cityId", "branch", "dayOfWeek");
CREATE INDEX IF NOT EXISTS "HomecareOpenDay_branch_dayOfWeek_idx" ON "HomecareOpenDay" ("branch", "dayOfWeek");
