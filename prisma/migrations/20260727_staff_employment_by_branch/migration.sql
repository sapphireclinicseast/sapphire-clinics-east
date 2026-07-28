-- Per-branch role, for staff who hold different roles at different branches (e.g. a
-- consultant at East who is an employee at Greenhills). HR only carries one
-- employmentType, so this is owned by Operations and left alone by /api/staff/sync,
-- exactly like extraBranches.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "employmentByBranch" JSONB;
