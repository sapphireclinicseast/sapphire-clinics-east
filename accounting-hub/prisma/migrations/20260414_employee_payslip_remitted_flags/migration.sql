-- Add taxRemitted and salariesRemitted flags to EmployeePayslip
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "taxRemitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "salariesRemitted" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "EmployeePayslip_taxRemitted_idx" ON "EmployeePayslip"("taxRemitted");
CREATE INDEX IF NOT EXISTS "EmployeePayslip_salariesRemitted_idx" ON "EmployeePayslip"("salariesRemitted");
