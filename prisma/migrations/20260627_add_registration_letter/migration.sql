-- One row per issued school registration letter. Reference number is
-- unique so the same AURA-REG-YYYY-NNNN never reappears.
-- Idempotent so the migrate container can re-run safely.

CREATE TABLE IF NOT EXISTS "ClassPortalRegistrationLetter" (
  "id"                    TEXT PRIMARY KEY,
  "referenceNumber"       TEXT NOT NULL,
  "studentId"             TEXT NOT NULL,
  "issuedBy"              TEXT NOT NULL,
  "issuedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "annualTuitionCentavos" INTEGER NOT NULL,
  "annualMiscCentavos"    INTEGER NOT NULL DEFAULT 500000,
  "annualTotalCentavos"   INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalRegistrationLetter_referenceNumber_key"
  ON "ClassPortalRegistrationLetter" ("referenceNumber");

CREATE INDEX IF NOT EXISTS "ClassPortalRegistrationLetter_studentId_idx"
  ON "ClassPortalRegistrationLetter" ("studentId");

CREATE INDEX IF NOT EXISTS "ClassPortalRegistrationLetter_issuedAt_idx"
  ON "ClassPortalRegistrationLetter" ("issuedAt");
