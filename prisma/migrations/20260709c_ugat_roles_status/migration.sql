-- UGAT hub: staff-admin accounts + scholar application status.
-- Idempotent (replayed every deploy with ON_ERROR_STOP=0).

-- Application status for the admin Dashboard.
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "status" TEXT NOT NULL DEFAULT 'APPLIED';
CREATE INDEX IF NOT EXISTS "UgatScholar_status_idx" ON "UgatScholar" ("status");

-- Staff-admin accounts (the MAIN admin `main` is virtual, no row here).
CREATE TABLE IF NOT EXISTS "UgatAdmin" (
  "id"           TEXT NOT NULL,
  "username"     TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "name"         TEXT NOT NULL,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"    TEXT,
  "disabledAt"   TIMESTAMP(3),
  CONSTRAINT "UgatAdmin_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatAdmin_username_key" ON "UgatAdmin" ("username");
CREATE INDEX IF NOT EXISTS "UgatAdmin_disabledAt_idx" ON "UgatAdmin" ("disabledAt");
