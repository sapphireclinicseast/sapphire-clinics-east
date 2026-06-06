-- Soft-disable for ClassPortalUser. disabledAt non-null => the account
-- cannot sign in and is hidden from teacher / front-desk / branch-admin
-- listings. Hard delete is intentionally not exposed: disabling
-- preserves the student's enrollment history and the audit trail of
-- any tuition payments tied to their record.
--
-- Idempotent: re-running this migration in a partial environment
-- (e.g. one branch's DB already had this column added manually) is a
-- no-op. We use IF NOT EXISTS for the column and the index.

ALTER TABLE "ClassPortalUser" ADD COLUMN IF NOT EXISTS "disabledAt" TIMESTAMP(3);
ALTER TABLE "ClassPortalUser" ADD COLUMN IF NOT EXISTS "disabledBy" TEXT;
CREATE INDEX IF NOT EXISTS "ClassPortalUser_disabledAt_idx" ON "ClassPortalUser"("disabledAt");
