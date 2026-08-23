-- Staff Loans & Perks: the per-person subledger behind 1160 Due from Employees.
CREATE TABLE IF NOT EXISTS "StaffLoan" (
  id text PRIMARY KEY,
  "employeeId" text REFERENCES "Employee"(id) ON DELETE SET NULL,
  "staffName" text NOT NULL,
  branch text,
  category text NOT NULL DEFAULT 'LOAN',
  description text,
  principal numeric(65,30) NOT NULL DEFAULT 0,
  "dateReleased" timestamp(3),
  "chequeRef" text,
  "perCutoff" numeric(65,30) NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ACTIVE',
  notes text,
  "createdById" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "StaffLoan_employeeId_idx" ON "StaffLoan"("employeeId");
CREATE INDEX IF NOT EXISTS "StaffLoan_status_idx" ON "StaffLoan"(status);

CREATE TABLE IF NOT EXISTS "StaffLoanDeduction" (
  id text PRIMARY KEY,
  "loanId" text NOT NULL REFERENCES "StaffLoan"(id) ON DELETE CASCADE,
  "cutoffPeriod" text NOT NULL,
  amount numeric(65,30) NOT NULL,
  source text NOT NULL DEFAULT 'IMPORT',
  "journalEntryId" text,
  "createdAt" timestamp(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "StaffLoanDeduction_loanId_cutoffPeriod_source_key" ON "StaffLoanDeduction"("loanId","cutoffPeriod",source);
CREATE INDEX IF NOT EXISTS "StaffLoanDeduction_cutoffPeriod_idx" ON "StaffLoanDeduction"("cutoffPeriod");

ALTER TABLE "CutoffAdjustment" ADD COLUMN IF NOT EXISTS "staffLoanId" text;
