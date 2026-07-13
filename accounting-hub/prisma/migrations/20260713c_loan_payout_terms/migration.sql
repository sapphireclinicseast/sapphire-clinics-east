-- Explicit per-period cash-out + repayment mode for loan/advance payment schedules.
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "payoutAmountPerPeriod" DECIMAL(65,30);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "repaymentMode" TEXT;
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "payoutAmountPerPeriod" DECIMAL(65,30);
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "repaymentMode" TEXT;
