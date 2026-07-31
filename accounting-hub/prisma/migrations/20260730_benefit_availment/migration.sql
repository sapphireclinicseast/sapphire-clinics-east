-- Statutory benefit availments (SSS maternity / sickness / ECC).
-- Monitoring only: the cash still flows through the RFP entries these rows point at.
CREATE TABLE IF NOT EXISTS "BenefitAvailment" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "employeeId" TEXT,
    "employeeName" TEXT NOT NULL,
    "benefitType" TEXT NOT NULL,
    "periodFrom" TIMESTAMP(3),
    "periodTo" TIMESTAMP(3),
    "amountAdvanced" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "companyShare" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "datePaidToEmployee" TIMESTAMP(3),
    "advanceRfpId" TEXT,
    "reimbursedAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "reimbursedDate" TIMESTAMP(3),
    "reimbursementRfpId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BenefitAvailment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BenefitAvailment_branch_idx" ON "BenefitAvailment"("branch");
CREATE INDEX IF NOT EXISTS "BenefitAvailment_employeeName_idx" ON "BenefitAvailment"("employeeName");
CREATE INDEX IF NOT EXISTS "BenefitAvailment_reimbursedDate_idx" ON "BenefitAvailment"("reimbursedDate");

-- The receivable these rows track. SSS owes it, not the employee, so it does not
-- belong in Due from Employees.
INSERT INTO "Account" ("id","accountNumber","accountTitle","accountType","normalBalance",
                       "isActive","createdById","description","createdAt","updatedAt")
SELECT 'clacct1165sssrec','1165','SSS/Statutory Benefits Receivable','ASSET','DEBIT',
       true,'cldefaultadmin001',
       'Maternity, sickness and ECC benefits advanced to staff and awaiting reimbursement from SSS',
       CURRENT_TIMESTAMP,CURRENT_TIMESTAMP
WHERE NOT EXISTS (SELECT 1 FROM "Account" WHERE "accountNumber"='1165');
