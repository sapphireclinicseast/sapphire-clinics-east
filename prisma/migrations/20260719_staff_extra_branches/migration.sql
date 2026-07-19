-- Add extraBranches array to Staff for multi-branch consultants.
-- Never overwritten by the HR Platform sync (sync payload excludes this field).
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "extraBranches" TEXT[] NOT NULL DEFAULT '{}';
