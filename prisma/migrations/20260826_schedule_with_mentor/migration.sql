-- "With Mentor" on a session: a Clinical Mentor sat in on a mentee's session,
-- so it bills as a mentorship service and payroll can pay the mentor.
--
-- The mentor/mentee identity itself lives on Staff (isClinicalMentor,
-- menteeIds) and is synced from HR — see 20260826_staff_clinical_mentor.
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "withMentor" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Schedule_withMentor_idx" ON "Schedule"("withMentor") WHERE "withMentor" = true;
