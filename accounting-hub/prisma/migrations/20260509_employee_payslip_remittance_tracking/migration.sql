-- Add per-employee remittance tracking to EmployeePayslip
-- salaryPaymentId: links to the SalaryPayment that settled this payslip's salary
-- benefitsRemitted: tracks whether this payslip's SSS/PHIC/HDMF have been remitted
-- benefitPaymentId: links to the BenefitPayment that settled this payslip's benefits

ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "salaryPaymentId" TEXT;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "benefitsRemitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "benefitPaymentId" TEXT;

-- Sync salariesRemitted from aggregate PayrollPayableStatus (for existing locked payslips)
UPDATE "EmployeePayslip" ep
SET "salariesRemitted" = true
FROM "PayrollPayableStatus" pps
WHERE pps."cutoffPeriod" = ep."cutoffPeriod"
  AND pps."branch" = ep."branch"
  AND pps."payrollType" = 'EMPLOYEE'
  AND pps."salariesRemitted" = true
  AND ep."status" = 'LOCKED';

-- Sync benefitsRemitted from aggregate PayrollPayableStatus (for existing locked payslips)
UPDATE "EmployeePayslip" ep
SET "benefitsRemitted" = true
FROM "PayrollPayableStatus" pps
WHERE pps."cutoffPeriod" = ep."cutoffPeriod"
  AND pps."branch" = ep."branch"
  AND pps."payrollType" = 'EMPLOYEE'
  AND pps."benefitsRemitted" = true
  AND ep."status" = 'LOCKED';

CREATE INDEX IF NOT EXISTS "EmployeePayslip_benefitsRemitted_idx" ON "EmployeePayslip"("benefitsRemitted");
CREATE INDEX IF NOT EXISTS "EmployeePayslip_salaryPaymentId_idx" ON "EmployeePayslip"("salaryPaymentId");
CREATE INDEX IF NOT EXISTS "EmployeePayslip_benefitPaymentId_idx" ON "EmployeePayslip"("benefitPaymentId");
