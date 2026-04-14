-- Add schedule fields to EmployeeRequest for CHANGE_SCHEDULE
ALTER TABLE "EmployeeRequest" ADD COLUMN IF NOT EXISTS "requestedScheduleIn" TEXT;
ALTER TABLE "EmployeeRequest" ADD COLUMN IF NOT EXISTS "requestedScheduleOut" TEXT;
ALTER TABLE "EmployeeRequest" ADD COLUMN IF NOT EXISTS "changeToWorkingDay" BOOLEAN;
