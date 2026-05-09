-- Add ignoreTimekeeping flag to Employee
-- When true: payslip generation pays fixed half-month salary regardless of biometric attendance records.
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "ignoreTimekeeping" BOOLEAN NOT NULL DEFAULT false;
