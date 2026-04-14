-- Late grace period and overtime interval/cap settings
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "lateGraceMinutes" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "otIntervalMinutes" INTEGER NOT NULL DEFAULT 30;
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "otMaxHours" DECIMAL(65,30) NOT NULL DEFAULT 3;
