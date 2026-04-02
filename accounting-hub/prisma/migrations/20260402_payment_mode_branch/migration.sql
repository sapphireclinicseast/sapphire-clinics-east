-- Add branch to PaymentMode (null = all branches)
ALTER TABLE "PaymentMode" ADD COLUMN IF NOT EXISTS "branch" TEXT;
