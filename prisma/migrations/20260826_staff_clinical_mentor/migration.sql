-- Clinical Mentor tag + mentee list — synced one-way from HR Platform
-- (Staff Profile checkbox + picker, person-level, via /staff/external).
-- Narrower than isInternshipSupervisor: grants Staff Portal visibility
-- into only the picked mentees' session notes, not everyone's.
-- menteeIds stores THIS table's local Staff.id values (translated from
-- HR's own ids during sync — see src/app/api/staff/sync/route.ts),
-- since that's what Teletherapy's queries actually key off.

ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "isClinicalMentor" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "menteeIds" TEXT[] NOT NULL DEFAULT '{}';

CREATE INDEX IF NOT EXISTS "Staff_isClinicalMentor_idx" ON "Staff"("isClinicalMentor");
