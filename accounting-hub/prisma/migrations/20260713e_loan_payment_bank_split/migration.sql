-- Explicit principal split + a dedicated bank for amortization/coupon payments.
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "principalPerPeriod" DECIMAL(65,30);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "paymentBankAccountId" TEXT;
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "principalPerPeriod" DECIMAL(65,30);
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "paymentBankAccountId" TEXT;
