-- Add unitPayId to Service
ALTER TABLE "Service" ADD COLUMN "unitPayId" TEXT;
CREATE INDEX "Service_unitPayId_idx" ON "Service"("unitPayId");

-- Consultant model
CREATE TABLE "Consultant" (
  "id" TEXT NOT NULL,
  "externalStaffId" TEXT,
  "name" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "taxDeduction" TEXT NOT NULL DEFAULT 'NONE',
  "monthlyRetainer" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Consultant_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "Consultant_externalStaffId_key" ON "Consultant"("externalStaffId");
CREATE INDEX "Consultant_department_idx" ON "Consultant"("department");
CREATE INDEX "Consultant_branch_idx" ON "Consultant"("branch");
CREATE INDEX "Consultant_isActive_idx" ON "Consultant"("isActive");

-- UnitPay model
CREATE TABLE "UnitPay" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "departments" JSONB NOT NULL DEFAULT '[]',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UnitPay_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "UnitPay_isActive_idx" ON "UnitPay"("isActive");

-- ConsultantUnitPay junction
CREATE TABLE "ConsultantUnitPay" (
  "id" TEXT NOT NULL,
  "consultantId" TEXT NOT NULL,
  "unitPayId" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "ConsultantUnitPay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "ConsultantUnitPay_consultantId_unitPayId_key" ON "ConsultantUnitPay"("consultantId", "unitPayId");
CREATE INDEX "ConsultantUnitPay_consultantId_idx" ON "ConsultantUnitPay"("consultantId");
CREATE INDEX "ConsultantUnitPay_unitPayId_idx" ON "ConsultantUnitPay"("unitPayId");

-- PayrollEntry model
CREATE TABLE "PayrollEntry" (
  "id" TEXT NOT NULL,
  "consultantId" TEXT NOT NULL,
  "cutoffPeriod" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "items" JSONB NOT NULL,
  "grossPay" DECIMAL(65,30) NOT NULL,
  "retainerAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "taxAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netPay" DECIMAL(65,30) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "PayrollEntry_consultantId_cutoffPeriod_branch_key" ON "PayrollEntry"("consultantId", "cutoffPeriod", "branch");
CREATE INDEX "PayrollEntry_consultantId_idx" ON "PayrollEntry"("consultantId");
CREATE INDEX "PayrollEntry_cutoffPeriod_idx" ON "PayrollEntry"("cutoffPeriod");
CREATE INDEX "PayrollEntry_branch_idx" ON "PayrollEntry"("branch");
CREATE INDEX "PayrollEntry_status_idx" ON "PayrollEntry"("status");

-- Foreign keys
ALTER TABLE "Service" ADD CONSTRAINT "Service_unitPayId_fkey"
  FOREIGN KEY ("unitPayId") REFERENCES "UnitPay"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ConsultantUnitPay" ADD CONSTRAINT "ConsultantUnitPay_consultantId_fkey"
  FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ConsultantUnitPay" ADD CONSTRAINT "ConsultantUnitPay_unitPayId_fkey"
  FOREIGN KEY ("unitPayId") REFERENCES "UnitPay"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_consultantId_fkey"
  FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "PayrollEntry" ADD CONSTRAINT "PayrollEntry_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
