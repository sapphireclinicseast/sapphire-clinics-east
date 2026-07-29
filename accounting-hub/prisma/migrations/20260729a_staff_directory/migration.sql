-- Accounting's own copy of the staff feed.
--
-- The Operations and HR feeds list only current staff, so a resignation reaches Payroll as an
-- absence — indistinguishable from a feed that briefly failed. That ambiguity is why the
-- consultant sync kept anyone with payslips active forever, and why resigned consultants still
-- appeared in payslip generation. Remembering every person we have ever synced turns absence
-- into something we can act on.
--
-- This mirrors the FEED, not payroll. Payslips are keyed to Consultant/Employee rows, so
-- nothing here can hide what someone was paid.
CREATE TABLE IF NOT EXISTS "StaffDirectory" (
  "id"              TEXT NOT NULL,
  "externalStaffId" TEXT NOT NULL,
  "source"          TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "branch"          TEXT NOT NULL,
  "department"      TEXT,
  "employmentType"  TEXT,
  "activeUpstream"  BOOLEAN NOT NULL DEFAULT true,
  "firstSeenAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "lastSeenAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "missingSince"    TIMESTAMP(3),
  "resignedAt"      TIMESTAMP(3),
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "StaffDirectory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "StaffDirectory_externalStaffId_key" ON "StaffDirectory"("externalStaffId");
CREATE INDEX IF NOT EXISTS "StaffDirectory_branch_idx" ON "StaffDirectory"("branch");
CREATE INDEX IF NOT EXISTS "StaffDirectory_resignedAt_idx" ON "StaffDirectory"("resignedAt");
