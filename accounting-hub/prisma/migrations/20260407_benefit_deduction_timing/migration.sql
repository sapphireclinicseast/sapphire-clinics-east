-- Add benefit deduction timing setting
ALTER TABLE "EmployeeSettings" ADD COLUMN "benefitDeductionTiming" TEXT NOT NULL DEFAULT 'HALF_HALF';
