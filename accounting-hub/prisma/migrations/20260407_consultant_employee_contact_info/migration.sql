-- Add contact info and government ID columns to Consultant
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "tinNumber" TEXT;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "sssNumber" TEXT;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "philhealthNumber" TEXT;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "pagibigNumber" TEXT;

-- Add phone column to Employee
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "phone" TEXT;
