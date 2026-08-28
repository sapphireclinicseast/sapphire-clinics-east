-- Staff.source distinguishes HR-synced rows ("HR", default) from providers who
-- self-registered via the patient app ("SELF_SIGNUP"). Idempotent; the staff
-- app's setup.sql adds the same column, so whichever runs first wins.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "source" TEXT DEFAULT 'HR';
CREATE INDEX IF NOT EXISTS "Staff_source_idx" ON "Staff" ("source");
