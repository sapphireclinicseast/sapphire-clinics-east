-- Add per-branch employment details to Staff
-- Stores { SBEA: { employmentType, employeeId, department, jobTitle }, SBGH: {...} }
-- so the external API can emit separate payroll rows for each branch a person works at.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "branchEmployment" JSONB NOT NULL DEFAULT '{}';
