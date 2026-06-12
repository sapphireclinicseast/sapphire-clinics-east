-- Migration: Split HR09 into HR09_CLINICAL and HR09_ADMIN
-- HR09_CLINICAL: Each admin staff member assessed by ≥10 randomly selected clinical staff (annual)
-- HR09_ADMIN:    Each admin staff member assessed by ≥5 randomly selected admin peers (annual)
--
-- Existing HR09 records are migrated to HR09_CLINICAL (the closest equivalent).

-- Step 1: Add the two new enum values
ALTER TYPE "PeerEvalType" ADD VALUE 'HR09_CLINICAL';
ALTER TYPE "PeerEvalType" ADD VALUE 'HR09_ADMIN';

-- Step 2: Migrate existing HR09 records → HR09_CLINICAL
UPDATE "PeerEvalAssignment"
  SET "formType" = 'HR09_CLINICAL'::"PeerEvalType"
  WHERE "formType" = 'HR09'::"PeerEvalType";

UPDATE "PeerEvalResponse"
  SET "formType" = 'HR09_CLINICAL'::"PeerEvalType"
  WHERE "formType" = 'HR09'::"PeerEvalType";

-- Step 3: Remove the old HR09 value by recreating the enum
--   (PostgreSQL does not support DROP VALUE on enums directly; we swap types.)
CREATE TYPE "PeerEvalType_new" AS ENUM ('HR08_ADMIN', 'HR08_PEER', 'HR09_CLINICAL', 'HR09_ADMIN');

ALTER TABLE "PeerEvalAssignment"
  ALTER COLUMN "formType" TYPE "PeerEvalType_new"
  USING "formType"::text::"PeerEvalType_new";

ALTER TABLE "PeerEvalResponse"
  ALTER COLUMN "formType" TYPE "PeerEvalType_new"
  USING "formType"::text::"PeerEvalType_new";

DROP TYPE "PeerEvalType";
ALTER TYPE "PeerEvalType_new" RENAME TO "PeerEvalType";
