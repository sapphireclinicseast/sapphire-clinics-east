-- Add expenseAccountId to UnitPay
ALTER TABLE "UnitPay" ADD COLUMN IF NOT EXISTS "expenseAccountId" TEXT;
CREATE INDEX IF NOT EXISTS "UnitPay_expenseAccountId_idx" ON "UnitPay"("expenseAccountId");

-- Add taxRemitted to PayrollEntry
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "taxRemitted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "PayrollEntry_taxRemitted_idx" ON "PayrollEntry"("taxRemitted");

-- Create TaxPayment table
CREATE TABLE IF NOT EXISTS "TaxPayment" (
  "id" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "totalAmount" DECIMAL(65,30) NOT NULL,
  "fromAccountId" TEXT NOT NULL,
  "proofUrl" TEXT,
  "notes" TEXT,
  "paymentType" TEXT NOT NULL DEFAULT 'CONSULTANT',
  "status" TEXT NOT NULL DEFAULT 'COMPLETED',
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TaxPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "TaxPayment_paymentDate_idx" ON "TaxPayment"("paymentDate");
CREATE INDEX IF NOT EXISTS "TaxPayment_paymentType_idx" ON "TaxPayment"("paymentType");
CREATE INDEX IF NOT EXISTS "TaxPayment_createdById_idx" ON "TaxPayment"("createdById");

-- Create TaxPaymentEntry table
CREATE TABLE IF NOT EXISTS "TaxPaymentEntry" (
  "id" TEXT NOT NULL,
  "taxPaymentId" TEXT NOT NULL,
  "payrollEntryId" TEXT NOT NULL,
  "taxAmount" DECIMAL(65,30) NOT NULL,
  CONSTRAINT "TaxPaymentEntry_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TaxPaymentEntry_taxPaymentId_fkey" FOREIGN KEY ("taxPaymentId") REFERENCES "TaxPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "TaxPaymentEntry_payrollEntryId_fkey" FOREIGN KEY ("payrollEntryId") REFERENCES "PayrollEntry"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX IF NOT EXISTS "TaxPaymentEntry_taxPaymentId_idx" ON "TaxPaymentEntry"("taxPaymentId");
CREATE INDEX IF NOT EXISTS "TaxPaymentEntry_payrollEntryId_idx" ON "TaxPaymentEntry"("payrollEntryId");

-- Create PayrollTaxSettings table
CREATE TABLE IF NOT EXISTS "PayrollTaxSettings" (
  "id" TEXT NOT NULL,
  "liabilityAccountId" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PayrollTaxSettings_pkey" PRIMARY KEY ("id")
);
