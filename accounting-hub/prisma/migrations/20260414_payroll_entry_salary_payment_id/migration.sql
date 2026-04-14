ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "salaryPaymentId" TEXT;
CREATE INDEX IF NOT EXISTS "PayrollEntry_salaryPaymentId_idx" ON "PayrollEntry"("salaryPaymentId");
