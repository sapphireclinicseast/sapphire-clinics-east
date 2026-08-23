-- Patient branches: enum Branch -> text.
--
-- A Postgres enum cannot grow at runtime, so a branch created in HR Platform
-- could never appear as a patient option without a schema change and a deploy.
-- Staff already stored its branches as text (Staff.branch is text,
-- Staff.extraBranches is text[]), which is exactly why interbranch STAFF
-- worked while interbranch PATIENTS did not. This brings Patient onto the
-- same pattern; valid values are the HrBranch.opsHubBranch codes that sync
-- hourly from HR Platform.
--
-- Value-preserving: every existing enum label casts to the identical string,
-- so no data is rewritten in meaning and no backfill is required.
--
-- The default has to be dropped first — Postgres cannot re-type a column
-- while a default of the old type is attached — and is restored after.
--
-- Idempotent, because this repo replays migration.sql through psql with
-- ON_ERROR_STOP=0 and would otherwise swallow a partial failure: the DO block
-- is a no-op once the columns are already text.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'Patient' AND column_name = 'branch' AND udt_name = 'Branch'
  ) THEN
    ALTER TABLE "Patient" ALTER COLUMN "branches" DROP DEFAULT;
    ALTER TABLE "Patient" ALTER COLUMN "branch"   TYPE TEXT   USING "branch"::text;
    ALTER TABLE "Patient" ALTER COLUMN "branches" TYPE TEXT[] USING "branches"::text[];
    ALTER TABLE "Patient" ALTER COLUMN "branches" SET DEFAULT '{}';
  END IF;
END $$;

-- The type itself is left in place. Nothing references it once the two columns
-- above are text, but dropping it is not what this migration is for and it
-- costs nothing to keep — it also leaves the change trivially reversible.
