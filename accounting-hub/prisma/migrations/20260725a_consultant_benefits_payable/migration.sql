-- Consultant benefit contributions on PayrollEntry (mirror EmployeePayslip)
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "sssDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "philhealthDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "pagibigDeduction" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "sssEmployerShare" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "philhealthEmployerShare" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "pagibigEmployerShare" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "benefitsRemitted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "benefitPaymentId" TEXT;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "benefitRfpId" TEXT;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "sssRfpId" TEXT;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "philhealthRfpId" TEXT;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "pagibigRfpId" TEXT;

-- Per-agency Benefits-Payable RFP locks on employee payslips
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "sssRfpId" TEXT;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "philhealthRfpId" TEXT;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "pagibigRfpId" TEXT;

-- Per-consultant benefit settings
CREATE TABLE IF NOT EXISTS "ConsultantBenefit" (
  "id" TEXT NOT NULL,
  "consultantId" TEXT NOT NULL,
  "benefitType" TEXT NOT NULL,
  "employeeShare" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "employerShare" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "effectiveDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ConsultantBenefit_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConsultantBenefit_consultantId_idx" ON "ConsultantBenefit"("consultantId");
CREATE INDEX IF NOT EXISTS "ConsultantBenefit_benefitType_idx" ON "ConsultantBenefit"("benefitType");
CREATE INDEX IF NOT EXISTS "ConsultantBenefit_isActive_idx" ON "ConsultantBenefit"("isActive");
DO $$ BEGIN
  ALTER TABLE "ConsultantBenefit" ADD CONSTRAINT "ConsultantBenefit_consultantId_fkey"
    FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Reusable Other-Fees template for Benefits-Payable RFPs (one per branch)
CREATE TABLE IF NOT EXISTS "BenefitRfpFeeTemplate" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "fees" JSONB NOT NULL DEFAULT '[]',
  "updatedAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenefitRfpFeeTemplate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BenefitRfpFeeTemplate_branch_key" ON "BenefitRfpFeeTemplate"("branch");
