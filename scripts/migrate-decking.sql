-- Decking Module migration
-- Run on VPS: docker compose --env-file .env.production exec -T db psql -U $POSTGRES_USER $POSTGRES_DB < /opt/sapphire/scripts/migrate-decking.sql

CREATE TABLE IF NOT EXISTS "DeckingClinicHours" (
  "id"        TEXT      NOT NULL,
  "schedule"  JSONB     NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeckingClinicHours_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DeckingTherapistConfig" (
  "id"         TEXT         NOT NULL,
  "staffId"    TEXT         NOT NULL,
  "workDays"   JSONB        NOT NULL,
  "startTime"  TEXT         NOT NULL,
  "endTime"    TEXT         NOT NULL,
  "useDefault" BOOLEAN      NOT NULL DEFAULT true,
  "branch"     TEXT         NOT NULL,
  "department" TEXT         NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeckingTherapistConfig_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeckingTherapistConfig_staffId_key"
  ON "DeckingTherapistConfig"("staffId");

ALTER TABLE "DeckingTherapistConfig"
  ADD CONSTRAINT IF NOT EXISTS "DeckingTherapistConfig_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "DeckingSlot" (
  "id"         TEXT         NOT NULL,
  "staffId"    TEXT         NOT NULL,
  "patientId"  TEXT,
  "dayOfWeek"  TEXT         NOT NULL,
  "startTime"  TEXT         NOT NULL,
  "endTime"    TEXT         NOT NULL,
  "branch"     TEXT         NOT NULL,
  "department" TEXT         NOT NULL,
  "notes"      TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeckingSlot_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeckingSlot_staffId_dayOfWeek_startTime_key"
  ON "DeckingSlot"("staffId", "dayOfWeek", "startTime");

ALTER TABLE "DeckingSlot"
  ADD CONSTRAINT IF NOT EXISTS "DeckingSlot_staffId_fkey"
  FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "DeckingSlot"
  ADD CONSTRAINT IF NOT EXISTS "DeckingSlot_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
