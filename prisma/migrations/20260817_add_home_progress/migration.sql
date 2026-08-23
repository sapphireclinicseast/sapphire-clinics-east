-- Patient "Home Progress" media log. Idempotent (replayed on every deploy).
CREATE TABLE IF NOT EXISTS "HomeProgressEntry" (
  "id"        TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL,
  "remarks"   TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomeProgressEntry_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HomeProgressEntry_patientId_idx" ON "HomeProgressEntry"("patientId");

CREATE TABLE IF NOT EXISTS "HomeProgressFile" (
  "id"        TEXT NOT NULL,
  "entryId"   TEXT NOT NULL,
  "kind"      TEXT NOT NULL,
  "fileName"  TEXT NOT NULL,
  "filePath"  TEXT NOT NULL,
  "mimeType"  TEXT NOT NULL,
  "sizeBytes" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomeProgressFile_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "HomeProgressFile_entryId_idx" ON "HomeProgressFile"("entryId");

DO $$ BEGIN
  ALTER TABLE "HomeProgressEntry" ADD CONSTRAINT "HomeProgressEntry_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "HomeProgressFile" ADD CONSTRAINT "HomeProgressFile_entryId_fkey"
    FOREIGN KEY ("entryId") REFERENCES "HomeProgressEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
