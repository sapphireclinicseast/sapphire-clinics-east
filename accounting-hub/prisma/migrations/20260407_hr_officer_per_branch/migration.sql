-- Replace single hrOfficerName with per-branch columns
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "hrOfficerNameSBEA" TEXT;
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "hrOfficerNameSBGH" TEXT;
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "hrOfficerNameVERDANA" TEXT;

-- Migrate existing data if hrOfficerName was set
UPDATE "EmployeeSettings" SET
  "hrOfficerNameSBEA" = "hrOfficerName",
  "hrOfficerNameSBGH" = "hrOfficerName",
  "hrOfficerNameVERDANA" = "hrOfficerName"
WHERE "hrOfficerName" IS NOT NULL;

-- Drop old column
ALTER TABLE "EmployeeSettings" DROP COLUMN IF EXISTS "hrOfficerName";
