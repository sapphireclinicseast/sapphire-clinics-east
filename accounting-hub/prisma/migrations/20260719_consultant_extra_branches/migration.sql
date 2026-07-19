-- Add extraBranches to Consultant for multi-branch consultants.
-- Never overwritten by the HR/Staff sync (field is ops-hub-managed only).
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "extraBranches" TEXT[] NOT NULL DEFAULT '{}';
