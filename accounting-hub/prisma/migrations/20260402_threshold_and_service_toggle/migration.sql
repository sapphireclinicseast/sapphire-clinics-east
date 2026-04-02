-- Add threshold-based unit pay fields to ConsultantUnitPay
ALTER TABLE "ConsultantUnitPay" ADD COLUMN IF NOT EXISTS "thresholdEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "ConsultantUnitPay" ADD COLUMN IF NOT EXISTS "thresholdAmount" DECIMAL;
ALTER TABLE "ConsultantUnitPay" ADD COLUMN IF NOT EXISTS "reducedAmount" DECIMAL;

-- Add unit pay enabled toggle to Service
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "unitPayEnabled" BOOLEAN NOT NULL DEFAULT true;
