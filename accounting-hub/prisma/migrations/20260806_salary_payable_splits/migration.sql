-- Net pay broken into instalments so each can be paid and bank-reconciled
-- separately. Splits of a payslip must sum to its net pay, so splitting changes
-- only the timing of payment, never the amount owed.
-- Re-run safe: the deploy replays every migration file on each deploy.
CREATE TABLE IF NOT EXISTS "SalaryPayableSplit" (
  "id"                TEXT NOT NULL,
  "employeePayslipId" TEXT,
  "payrollEntryId"    TEXT,
  "seq"               INTEGER NOT NULL,
  "amount"            DECIMAL(12,2) NOT NULL,
  "note"              TEXT,
  "salariesRemitted"  BOOLEAN NOT NULL DEFAULT false,
  "salaryRfpId"       TEXT,
  "salaryPaymentId"   TEXT,
  "paidAt"            TIMESTAMP(3),
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdById"       TEXT,
  CONSTRAINT "SalaryPayableSplit_pkey" PRIMARY KEY ("id")
);

-- A split belongs to exactly one payslip — never both, never neither.
DO $$ BEGIN
  ALTER TABLE "SalaryPayableSplit" ADD CONSTRAINT "SalaryPayableSplit_one_parent"
    CHECK (("employeePayslipId" IS NOT NULL) <> ("payrollEntryId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SalaryPayableSplit" ADD CONSTRAINT "SalaryPayableSplit_employeePayslipId_fkey"
    FOREIGN KEY ("employeePayslipId") REFERENCES "EmployeePayslip"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "SalaryPayableSplit" ADD CONSTRAINT "SalaryPayableSplit_payrollEntryId_fkey"
    FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "SalaryPayableSplit_employeePayslipId_seq_key" ON "SalaryPayableSplit"("employeePayslipId", "seq");
CREATE UNIQUE INDEX IF NOT EXISTS "SalaryPayableSplit_payrollEntryId_seq_key"    ON "SalaryPayableSplit"("payrollEntryId", "seq");
CREATE INDEX IF NOT EXISTS "SalaryPayableSplit_employeePayslipId_idx" ON "SalaryPayableSplit"("employeePayslipId");
CREATE INDEX IF NOT EXISTS "SalaryPayableSplit_payrollEntryId_idx"    ON "SalaryPayableSplit"("payrollEntryId");
CREATE INDEX IF NOT EXISTS "SalaryPayableSplit_salaryRfpId_idx"       ON "SalaryPayableSplit"("salaryRfpId");
CREATE INDEX IF NOT EXISTS "SalaryPayableSplit_salariesRemitted_idx"  ON "SalaryPayableSplit"("salariesRemitted");
CREATE INDEX IF NOT EXISTS "SalaryPayableSplit_salaryPaymentId_idx"   ON "SalaryPayableSplit"("salaryPaymentId");
