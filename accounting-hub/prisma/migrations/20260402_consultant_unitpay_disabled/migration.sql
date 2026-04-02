-- Add disabled flag to ConsultantUnitPay
ALTER TABLE "ConsultantUnitPay" ADD COLUMN IF NOT EXISTS "disabled" BOOLEAN NOT NULL DEFAULT false;
