-- AlterTable: Add HR Platform sync fields to Staff
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "jobTitle" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "employmentType" TEXT;
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "hrPlatformId" TEXT;
ALTER TABLE "Staff" ALTER COLUMN "createdById" DROP NOT NULL;
