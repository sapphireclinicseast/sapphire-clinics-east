-- Class-portal intern lifecycle: mint TEACHER accounts from HR-hub interns
-- with an auto-disable cron 15 days after the intern's contract end month.

ALTER TABLE "ClassPortalUser"
  ADD COLUMN IF NOT EXISTS "isIntern"      BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "linkedStaffId" TEXT;

CREATE INDEX IF NOT EXISTS "ClassPortalUser_isIntern_idx"      ON "ClassPortalUser"("isIntern");
CREATE INDEX IF NOT EXISTS "ClassPortalUser_linkedStaffId_idx" ON "ClassPortalUser"("linkedStaffId");
