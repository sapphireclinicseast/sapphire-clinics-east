-- Payroll Salaries/Benefits Payable now flow through an RFP (Expenses) before payment.
ALTER TABLE "PayrollEntry"    ADD COLUMN IF NOT EXISTS "salaryRfpId" TEXT;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "salaryRfpId" TEXT;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "benefitRfpId" TEXT;
ALTER TABLE "SalaryPayment"   ADD COLUMN IF NOT EXISTS "remarks" TEXT;
ALTER TABLE "BenefitPayment"  ADD COLUMN IF NOT EXISTS "remarks" TEXT;
