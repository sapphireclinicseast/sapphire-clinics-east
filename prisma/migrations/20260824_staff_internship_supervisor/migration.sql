-- Clinical Internship Supervisor tag — synced one-way from HR Platform
-- (Staff Profile checkbox, person-level, via /staff/external). Staff
-- Portal reads this off the same shared DB to grant an "All Interns"
-- view (every intern's notes, not just their own decked interns).

ALTER TABLE "Staff"
  ADD COLUMN IF NOT EXISTS "isInternshipSupervisor" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "Staff_isInternshipSupervisor_idx" ON "Staff"("isInternshipSupervisor");
