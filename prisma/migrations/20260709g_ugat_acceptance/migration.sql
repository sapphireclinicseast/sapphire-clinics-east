-- UGAT Phase 3: Acceptance (RSA signing + co-maker) + signing deadlines.
-- Idempotent (replayed every deploy with ON_ERROR_STOP=0).

ALTER TABLE "UgatApplicationCycle" ADD COLUMN IF NOT EXISTS "softCopyDeadline" TIMESTAMP(3);
ALTER TABLE "UgatApplicationCycle" ADD COLUMN IF NOT EXISTS "hardCopyDeadline" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "UgatAcceptance" (
  "id"                TEXT NOT NULL,
  "scholarId"         TEXT NOT NULL,
  "contractSentAt"    TIMESTAMP(3),
  "comakerFirstName"  TEXT,
  "comakerMiddleName" TEXT,
  "comakerLastName"   TEXT,
  "comakerBirthdate"  TIMESTAMP(3),
  "comakerEmail"      TEXT,
  "comakerOccupation" TEXT,
  "cmPermAddress1"    TEXT,
  "cmPermAddress2"    TEXT,
  "cmPermCity"        TEXT,
  "cmPermRegion"      TEXT,
  "cmPermZip"         TEXT,
  "cmPresSameAsPerm"  BOOLEAN NOT NULL DEFAULT false,
  "cmPresAddress1"    TEXT,
  "cmPresAddress2"    TEXT,
  "cmPresCity"        TEXT,
  "cmPresRegion"      TEXT,
  "cmPresZip"         TEXT,
  "cmOccAddress1"     TEXT,
  "cmOccAddress2"     TEXT,
  "cmOccCity"         TEXT,
  "cmOccRegion"       TEXT,
  "cmOccZip"          TEXT,
  "truthAffirmed"     BOOLEAN NOT NULL DEFAULT false,
  "softCopySignedAt"  TIMESTAMP(3),
  "hardCopySignedAt"  TIMESTAMP(3),
  "hardCopyMarkedBy"  TEXT,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatAcceptance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatAcceptance_scholarId_key" ON "UgatAcceptance" ("scholarId");
CREATE INDEX IF NOT EXISTS "UgatAcceptance_contractSentAt_idx" ON "UgatAcceptance" ("contractSentAt");
CREATE INDEX IF NOT EXISTS "UgatAcceptance_softCopySignedAt_idx" ON "UgatAcceptance" ("softCopySignedAt");
DO $$ BEGIN
  ALTER TABLE "UgatAcceptance" ADD CONSTRAINT "UgatAcceptance_scholarId_fkey"
    FOREIGN KEY ("scholarId") REFERENCES "UgatScholar"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
