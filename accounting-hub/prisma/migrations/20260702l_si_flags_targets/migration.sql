CREATE TABLE IF NOT EXISTS "SalesInvoiceFlag" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "siNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "remarks" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesInvoiceFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesInvoiceFlag_branch_siNumber_key" ON "SalesInvoiceFlag"("branch","siNumber");
CREATE INDEX IF NOT EXISTS "SalesInvoiceFlag_branch_idx" ON "SalesInvoiceFlag"("branch");
CREATE TABLE IF NOT EXISTS "SalesTarget" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "target" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesTarget_branch_periodMonth_periodYear_key" ON "SalesTarget"("branch","periodMonth","periodYear");
CREATE INDEX IF NOT EXISTS "SalesTarget_branch_idx" ON "SalesTarget"("branch");
