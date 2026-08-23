-- Add the 3 email-automation sender columns to the synced HrBranch cache
-- (see HR Platform's Branches Registry "Email Automation" section, and
-- migration 20260818_hr_branch_registry for the table itself). Idempotent
-- — replayed on every deploy.
ALTER TABLE "HrBranch" ADD COLUMN IF NOT EXISTS "emailPayslips" TEXT;
ALTER TABLE "HrBranch" ADD COLUMN IF NOT EXISTS "emailSchedules" TEXT;
ALTER TABLE "HrBranch" ADD COLUMN IF NOT EXISTS "emailSessionNotes" TEXT;
