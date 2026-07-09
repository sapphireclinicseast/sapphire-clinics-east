-- UGAT: application cycles (academic year + open/close window) + tag apps.
-- Idempotent (replayed every deploy with ON_ERROR_STOP=0).

ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "academicYear" TEXT;
CREATE INDEX IF NOT EXISTS "UgatApplication_academicYear_idx" ON "UgatApplication" ("academicYear");

CREATE TABLE IF NOT EXISTS "UgatApplicationCycle" (
  "id"           TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "opensAt"      TIMESTAMP(3) NOT NULL,
  "closesAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatApplicationCycle_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatApplicationCycle_academicYear_key" ON "UgatApplicationCycle" ("academicYear");
CREATE INDEX IF NOT EXISTS "UgatApplicationCycle_opensAt_closesAt_idx" ON "UgatApplicationCycle" ("opensAt", "closesAt");
