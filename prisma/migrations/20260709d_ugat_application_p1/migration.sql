-- UGAT Phase 1: applications, uploads, viewable passwords, university admins.
-- Idempotent (replayed every deploy with ON_ERROR_STOP=0).

-- Viewable password copies for User Access.
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "passwordPlain" TEXT;
ALTER TABLE "UgatAdmin"   ADD COLUMN IF NOT EXISTS "passwordPlain" TEXT;

-- University-admin account type.
ALTER TABLE "UgatAdmin" ADD COLUMN IF NOT EXISTS "kind" TEXT NOT NULL DEFAULT 'STAFF';

-- Binary uploads (photo, letter, grades, signature, IDs).
CREATE TABLE IF NOT EXISTS "UgatUpload" (
  "id"        TEXT NOT NULL,
  "scholarId" TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "filename"  TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL,
  "data"      BYTEA NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatUpload_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UgatUpload_scholarId_kind_idx" ON "UgatUpload" ("scholarId", "kind");
DO $$ BEGIN
  ALTER TABLE "UgatUpload" ADD CONSTRAINT "UgatUpload_scholarId_fkey"
    FOREIGN KEY ("scholarId") REFERENCES "UgatScholar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Applications (Part I / Initial).
CREATE TABLE IF NOT EXISTS "UgatApplication" (
  "id"              TEXT NOT NULL,
  "scholarId"       TEXT NOT NULL,
  "q1WhyApply"      TEXT,
  "q2Initiatives"   TEXT,
  "q3WhyProgram"    TEXT,
  "q4StipendUse"    TEXT,
  "q5ReturnService" TEXT,
  "q6ArawNgKalinga" TEXT,
  "q7FiveYearPlan"  TEXT,
  "truthAffirmed"   BOOLEAN NOT NULL DEFAULT false,
  "signedAt"        TIMESTAMP(3),
  "submittedAt"     TIMESTAMP(3),
  "initialDecision" TEXT NOT NULL DEFAULT 'PENDING',
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatApplication_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatApplication_scholarId_key" ON "UgatApplication" ("scholarId");
CREATE INDEX IF NOT EXISTS "UgatApplication_submittedAt_idx" ON "UgatApplication" ("submittedAt");
CREATE INDEX IF NOT EXISTS "UgatApplication_initialDecision_idx" ON "UgatApplication" ("initialDecision");
DO $$ BEGIN
  ALTER TABLE "UgatApplication" ADD CONSTRAINT "UgatApplication_scholarId_fkey"
    FOREIGN KEY ("scholarId") REFERENCES "UgatScholar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
