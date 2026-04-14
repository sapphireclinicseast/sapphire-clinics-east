-- Drop unique constraint on CutoffAdjustment to allow multiple rows per employee per cutoff
-- This enables multiple allowances/deductions per employee per cutoff period
DROP INDEX IF EXISTS "CutoffAdjustment_employeeId_cutoffPeriod_branch_key";

-- Add composite index (non-unique) for lookup performance
CREATE INDEX IF NOT EXISTS "CutoffAdjustment_employeeId_cutoffPeriod_branch_idx" ON "CutoffAdjustment"("employeeId", "cutoffPeriod", "branch");

-- Create ConsultantCutoffAdjustment table for consultant allowances/deductions
CREATE TABLE IF NOT EXISTS "ConsultantCutoffAdjustment" (
    "id" TEXT NOT NULL,
    "consultantId" TEXT NOT NULL,
    "cutoffPeriod" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "allowance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allowanceType" TEXT NOT NULL DEFAULT 'NON_TAXABLE',
    "allowanceLabel" TEXT,
    "deduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductionLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ConsultantCutoffAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_consultantId_cutoffPeriod_branch_idx" ON "ConsultantCutoffAdjustment"("consultantId", "cutoffPeriod", "branch");
CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_consultantId_idx" ON "ConsultantCutoffAdjustment"("consultantId");
CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_cutoffPeriod_idx" ON "ConsultantCutoffAdjustment"("cutoffPeriod");
CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_branch_idx" ON "ConsultantCutoffAdjustment"("branch");

ALTER TABLE "ConsultantCutoffAdjustment" ADD CONSTRAINT "ConsultantCutoffAdjustment_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
