-- TK Upload status workflow
CREATE TYPE "TKUploadStatus" AS ENUM ('UPLOADED', 'ACCEPTED', 'FINALIZED');
ALTER TABLE "TimekeepingUpload" ADD COLUMN IF NOT EXISTS "status" "TKUploadStatus" NOT NULL DEFAULT 'UPLOADED';
CREATE INDEX IF NOT EXISTS "TimekeepingUpload_status_idx" ON "TimekeepingUpload"("status");

-- Mark existing uploads as FINALIZED (backward compatibility)
UPDATE "TimekeepingUpload" SET "status" = 'FINALIZED';

-- CutoffAdjustment table for per-employee per-cutoff allowances/deductions
CREATE TABLE IF NOT EXISTS "CutoffAdjustment" (
    "id" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "cutoffPeriod" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "allowance" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allowanceType" TEXT NOT NULL DEFAULT 'NON_TAXABLE',
    "allowanceLabel" TEXT,
    "deduction" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductionLabel" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CutoffAdjustment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "CutoffAdjustment_employeeId_cutoffPeriod_branch_key" ON "CutoffAdjustment"("employeeId", "cutoffPeriod", "branch");
CREATE INDEX IF NOT EXISTS "CutoffAdjustment_employeeId_idx" ON "CutoffAdjustment"("employeeId");
CREATE INDEX IF NOT EXISTS "CutoffAdjustment_cutoffPeriod_idx" ON "CutoffAdjustment"("cutoffPeriod");
CREATE INDEX IF NOT EXISTS "CutoffAdjustment_branch_idx" ON "CutoffAdjustment"("branch");

ALTER TABLE "CutoffAdjustment" ADD CONSTRAINT "CutoffAdjustment_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "Employee"("id") ON DELETE CASCADE ON UPDATE CASCADE;
