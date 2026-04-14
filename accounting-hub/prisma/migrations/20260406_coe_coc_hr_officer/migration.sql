-- Add CERTIFICATE_OF_CONSULTATION to EmployeeRequestType enum
ALTER TYPE "EmployeeRequestType" ADD VALUE IF NOT EXISTS 'CERTIFICATE_OF_CONSULTATION';

-- Add hrOfficerName to EmployeeSettings
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "hrOfficerName" TEXT;

-- Make employeeId nullable on EmployeeRequest (for consultant requests)
ALTER TABLE "EmployeeRequest" ALTER COLUMN "employeeId" DROP NOT NULL;

-- Add consultantId to EmployeeRequest
ALTER TABLE "EmployeeRequest" ADD COLUMN IF NOT EXISTS "consultantId" TEXT;

-- Add foreign key for consultantId
ALTER TABLE "EmployeeRequest" ADD CONSTRAINT "EmployeeRequest_consultantId_fkey" FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Add index for consultantId
CREATE INDEX IF NOT EXISTS "EmployeeRequest_consultantId_idx" ON "EmployeeRequest"("consultantId");
