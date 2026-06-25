-- Soft-delete flag for staff. Inactive staff (no longer in HR's active feed)
-- are deactivated rather than hard-deleted (they have survey/peer-eval history
-- with FK constraints), and hidden from the Staff Module, Top 5, etc.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "active" BOOLEAN NOT NULL DEFAULT true;
