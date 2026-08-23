-- Documentation age lock for staff-portal session notes.
--
-- Sessions older than the documentation window are read-only in the staff
-- portal (teletherapy) until a clinician deliberately re-opens one. These two
-- columns record that decision so the server can enforce the lock rather than
-- leaving it to the browser.
--
-- The lock state itself is DERIVED from Schedule.date at read time, so there
-- is no backfill here and nothing to recompute: existing sessions become
-- locked the moment this ships, and each one ages out on its own date.
--
-- Idempotent: this repo replays migration.sql through psql with
-- ON_ERROR_STOP=0, so a failure here would be logged and ignored. IF NOT
-- EXISTS keeps a re-run clean instead of relying on that.
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "noteUnlockedAt"   TIMESTAMP(3);
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "noteUnlockedById" TEXT;
