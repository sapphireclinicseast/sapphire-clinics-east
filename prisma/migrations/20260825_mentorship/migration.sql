-- Mentorship identity, synced from HR (isClinicalMentor + menteeIds), and the
-- per-session "With Mentor" flag that cashiering keys off.
--
-- Separate from internship supervision on purpose: a Clinical Supervisor
-- oversees students, a Clinical Mentor guides junior licensed clinicians, and
-- one person can be both.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "isClinicalMentor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "mentorStaffId" TEXT;

-- SET NULL, not CASCADE: removing a mentor must not delete their mentees.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Staff_mentorStaffId_fkey') THEN
    ALTER TABLE "Staff" ADD CONSTRAINT "Staff_mentorStaffId_fkey"
      FOREIGN KEY ("mentorStaffId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Staff_mentorStaffId_idx" ON "Staff"("mentorStaffId");

ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "withMentor" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "Schedule_withMentor_idx" ON "Schedule"("withMentor") WHERE "withMentor" = true;
