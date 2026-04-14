-- Add new price scheduling fields to Service
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "newPrice" DECIMAL(65,30);
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "newPriceEffectiveDate" TIMESTAMP(3);

-- Add referenceNumber to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;

-- Create ServiceBranchPrice table for per-branch pricing on ALL-branch services
CREATE TABLE IF NOT EXISTS "ServiceBranchPrice" (
    "id" TEXT NOT NULL,
    "serviceId" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "price" DECIMAL(65,30) NOT NULL,
    "newPrice" DECIMAL(65,30),
    "newPriceEffectiveDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ServiceBranchPrice_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceBranchPrice_serviceId_branch_key" ON "ServiceBranchPrice"("serviceId", "branch");
CREATE INDEX IF NOT EXISTS "ServiceBranchPrice_serviceId_idx" ON "ServiceBranchPrice"("serviceId");
CREATE INDEX IF NOT EXISTS "ServiceBranchPrice_branch_idx" ON "ServiceBranchPrice"("branch");

ALTER TABLE "ServiceBranchPrice" ADD CONSTRAINT "ServiceBranchPrice_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
