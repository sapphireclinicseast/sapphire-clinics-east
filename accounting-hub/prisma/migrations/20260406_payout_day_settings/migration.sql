-- Add payout day fields to EmployeeSettings
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "payout1Day" INTEGER NOT NULL DEFAULT 15;
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "payout2Day" INTEGER NOT NULL DEFAULT 30;
