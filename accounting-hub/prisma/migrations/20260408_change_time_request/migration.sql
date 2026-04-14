-- Add CHANGE_TIME_IN and CHANGE_TIME_OUT to EmployeeRequestType enum
ALTER TYPE "EmployeeRequestType" ADD VALUE IF NOT EXISTS 'CHANGE_TIME_IN';
ALTER TYPE "EmployeeRequestType" ADD VALUE IF NOT EXISTS 'CHANGE_TIME_OUT';

-- Add FILING to TimekeepingSource enum
ALTER TYPE "TimekeepingSource" ADD VALUE IF NOT EXISTS 'FILING';

-- Add requested time fields to EmployeeRequest
ALTER TABLE "EmployeeRequest" ADD COLUMN IF NOT EXISTS "requestedTimeIn" TEXT;
ALTER TABLE "EmployeeRequest" ADD COLUMN IF NOT EXISTS "requestedTimeOut" TEXT;

-- Add request approval excluded positions to EmployeeSettings
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "requestApprovalExcludedPositions" JSONB;
