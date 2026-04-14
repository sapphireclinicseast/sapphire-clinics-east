-- Add LOCKED to PayslipStatus enum
ALTER TYPE "PayslipStatus" ADD VALUE IF NOT EXISTS 'LOCKED';

-- Add employer share fields to EmployeePayslip
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "sssEmployerShare" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "philhealthEmployerShare" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "pagibigEmployerShare" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- PayrollCOAMapping
CREATE TABLE IF NOT EXISTS "PayrollCOAMapping" (
  "id" TEXT NOT NULL,
  "salaryExpenseAccountId" TEXT,
  "professionalFeesAccountId" TEXT,
  "sssERAccountId" TEXT,
  "hdmfERAccountId" TEXT,
  "philhealthERAccountId" TEXT,
  "employeeTaxExpenseAccountId" TEXT,
  "consultantTaxExpenseAccountId" TEXT,
  "salariesPayableAccountId" TEXT,
  "benefitsPayableAccountId" TEXT,
  "taxPayableAccountId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollCOAMapping_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_salaryExpenseAccountId_fkey" FOREIGN KEY ("salaryExpenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_professionalFeesAccountId_fkey" FOREIGN KEY ("professionalFeesAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_sssERAccountId_fkey" FOREIGN KEY ("sssERAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_hdmfERAccountId_fkey" FOREIGN KEY ("hdmfERAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_philhealthERAccountId_fkey" FOREIGN KEY ("philhealthERAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_employeeTaxExpenseAccountId_fkey" FOREIGN KEY ("employeeTaxExpenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_consultantTaxExpenseAccountId_fkey" FOREIGN KEY ("consultantTaxExpenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_salariesPayableAccountId_fkey" FOREIGN KEY ("salariesPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_benefitsPayableAccountId_fkey" FOREIGN KEY ("benefitsPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "PayrollCOAMapping" ADD CONSTRAINT "PayrollCOAMapping_taxPayableAccountId_fkey" FOREIGN KEY ("taxPayableAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- JournalEntry
CREATE TABLE IF NOT EXISTS "JournalEntry" (
  "id" TEXT NOT NULL,
  "entryDate" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "referenceType" TEXT NOT NULL,
  "referenceId" TEXT,
  "totalAmount" DECIMAL(65,30) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "JournalEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "JournalEntry_referenceType_referenceId_idx" ON "JournalEntry"("referenceType", "referenceId");
CREATE INDEX IF NOT EXISTS "JournalEntry_entryDate_idx" ON "JournalEntry"("entryDate");
CREATE INDEX IF NOT EXISTS "JournalEntry_createdById_idx" ON "JournalEntry"("createdById");

-- JournalEntryLine
CREATE TABLE IF NOT EXISTS "JournalEntryLine" (
  "id" TEXT NOT NULL,
  "journalEntryId" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "debit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "credit" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "description" TEXT,
  CONSTRAINT "JournalEntryLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_journalEntryId_fkey" FOREIGN KEY ("journalEntryId") REFERENCES "JournalEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JournalEntryLine" ADD CONSTRAINT "JournalEntryLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "JournalEntryLine_journalEntryId_idx" ON "JournalEntryLine"("journalEntryId");
CREATE INDEX IF NOT EXISTS "JournalEntryLine_accountId_idx" ON "JournalEntryLine"("accountId");

-- PayrollPayableStatus
CREATE TABLE IF NOT EXISTS "PayrollPayableStatus" (
  "id" TEXT NOT NULL,
  "cutoffPeriod" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "payrollType" TEXT NOT NULL,
  "totalSalariesPayable" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalBenefitsPayable" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "totalTaxPayable" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "salariesRemitted" BOOLEAN NOT NULL DEFAULT false,
  "benefitsRemitted" BOOLEAN NOT NULL DEFAULT false,
  "taxRemitted" BOOLEAN NOT NULL DEFAULT false,
  "salaryPaymentId" TEXT,
  "benefitPaymentId" TEXT,
  "taxPaymentId" TEXT,
  "journalEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PayrollPayableStatus_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PayrollPayableStatus_cutoffPeriod_branch_payrollType_key" ON "PayrollPayableStatus"("cutoffPeriod", "branch", "payrollType");
CREATE INDEX IF NOT EXISTS "PayrollPayableStatus_cutoffPeriod_idx" ON "PayrollPayableStatus"("cutoffPeriod");
CREATE INDEX IF NOT EXISTS "PayrollPayableStatus_branch_idx" ON "PayrollPayableStatus"("branch");

-- SalaryPayment
CREATE TABLE IF NOT EXISTS "SalaryPayment" (
  "id" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "totalAmount" DECIMAL(65,30) NOT NULL,
  "fromAccountId" TEXT NOT NULL,
  "proofUrl" TEXT,
  "notes" TEXT,
  "paymentType" TEXT NOT NULL DEFAULT 'EMPLOYEE',
  "cutoffPeriod" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "journalEntryId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalaryPayment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "SalaryPayment" ADD CONSTRAINT "SalaryPayment_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "SalaryPayment_paymentDate_idx" ON "SalaryPayment"("paymentDate");
CREATE INDEX IF NOT EXISTS "SalaryPayment_paymentType_idx" ON "SalaryPayment"("paymentType");
CREATE INDEX IF NOT EXISTS "SalaryPayment_cutoffPeriod_idx" ON "SalaryPayment"("cutoffPeriod");

-- BenefitPayment
CREATE TABLE IF NOT EXISTS "BenefitPayment" (
  "id" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "totalAmount" DECIMAL(65,30) NOT NULL,
  "fromAccountId" TEXT NOT NULL,
  "proofUrl" TEXT,
  "notes" TEXT,
  "cutoffPeriod" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "journalEntryId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BenefitPayment_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "BenefitPayment" ADD CONSTRAINT "BenefitPayment_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "BenefitPayment_paymentDate_idx" ON "BenefitPayment"("paymentDate");
CREATE INDEX IF NOT EXISTS "BenefitPayment_cutoffPeriod_idx" ON "BenefitPayment"("cutoffPeriod");
