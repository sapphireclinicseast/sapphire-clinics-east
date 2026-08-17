-- Patient portal concern/support tickets. Idempotent (replayed on every deploy).
CREATE TABLE IF NOT EXISTS "PatientTicket" (
  "id"            TEXT NOT NULL,
  "patientId"     TEXT NOT NULL,
  "subject"       TEXT NOT NULL,
  "description"   TEXT NOT NULL,
  "screenshot"    TEXT,
  "status"        TEXT NOT NULL DEFAULT 'OPEN',
  "adminResponse" TEXT,
  "resolvedAt"    TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientTicket_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "PatientTicket_patientId_idx" ON "PatientTicket"("patientId");

DO $$ BEGIN
  ALTER TABLE "PatientTicket"
    ADD CONSTRAINT "PatientTicket_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
