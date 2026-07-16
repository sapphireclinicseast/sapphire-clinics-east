-- Referred patients (a patient a referrer sent to us). Idempotent — replayed each deploy.
CREATE TABLE IF NOT EXISTS "ReferredPatient" (
  "id"          TEXT NOT NULL,
  "referrerId"  TEXT NOT NULL,
  "patientId"   TEXT,
  "patientName" TEXT NOT NULL,
  "note"        TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReferredPatient_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ReferredPatient_referrerId_idx" ON "ReferredPatient" ("referrerId");
CREATE INDEX IF NOT EXISTS "ReferredPatient_patientId_idx"  ON "ReferredPatient" ("patientId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ReferredPatient_referrerId_fkey') THEN
    ALTER TABLE "ReferredPatient"
      ADD CONSTRAINT "ReferredPatient_referrerId_fkey"
      FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
