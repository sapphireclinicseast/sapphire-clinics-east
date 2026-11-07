-- Discharge certificates issued from the Patient CRM, and the signatories who
-- may appear on one.
--
-- Guarded with IF NOT EXISTS throughout: this deploy replays every migration on
-- every run with no tracker, so each one has to be safe to re-apply.

CREATE TABLE IF NOT EXISTS "DischargeCertificate" (
  "id"            TEXT         NOT NULL,
  "patientId"     TEXT         NOT NULL,
  "patientName"   TEXT         NOT NULL,
  "service"       TEXT         NOT NULL,
  "dischargeDate" TIMESTAMP(3) NOT NULL,
  "awardedOn"     TEXT         NOT NULL,
  "therapistName" TEXT         NOT NULL DEFAULT '',
  "managerName"   TEXT         NOT NULL DEFAULT '',
  "filePath"      TEXT         NOT NULL,
  "issuedByName"  TEXT         NOT NULL DEFAULT '',
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DischargeCertificate_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "DischargeCertificate_patientId_idx" ON "DischargeCertificate"("patientId");
CREATE INDEX IF NOT EXISTS "DischargeCertificate_createdAt_idx" ON "DischargeCertificate"("createdAt");

-- Cascade: a deleted patient takes their certificates with them. Added
-- separately and guarded, because ADD CONSTRAINT has no IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DischargeCertificate_patientId_fkey'
  ) THEN
    ALTER TABLE "DischargeCertificate"
      ADD CONSTRAINT "DischargeCertificate_patientId_fkey"
      FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CertificateSignatory" (
  "id"            TEXT         NOT NULL,
  "staffId"       TEXT,
  "name"          TEXT         NOT NULL,
  "role"          TEXT         NOT NULL,
  "signaturePath" TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CertificateSignatory_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "CertificateSignatory_role_idx" ON "CertificateSignatory"("role");
