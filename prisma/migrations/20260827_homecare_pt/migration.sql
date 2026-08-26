-- Homecare Physical Therapy: city×date scheduling, per-branch clinic origins,
-- fare settings, and the booking fields that hang off PatientBooking.
-- Idempotent (CREATE ... IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) so replays
-- are safe. Purely additive — no existing table/column is altered destructively.

-- ── HomecareCity ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HomecareCity" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "province"  TEXT,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomecareCity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HomecareCity_name_province_key" ON "HomecareCity" ("name", "province");

-- ── HomecareOpenDay ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "HomecareOpenDay" (
  "id"        TEXT NOT NULL,
  "cityId"    TEXT NOT NULL,
  "branch"    TEXT NOT NULL,
  "date"      TIMESTAMP(3) NOT NULL,
  "startTime" TEXT NOT NULL DEFAULT '09:00',
  "endTime"   TEXT NOT NULL DEFAULT '17:00',
  "capacity"  INTEGER NOT NULL DEFAULT 6,
  "disabled"  BOOLEAN NOT NULL DEFAULT false,
  "notes"     TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomecareOpenDay_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HomecareOpenDay_cityId_branch_date_key" ON "HomecareOpenDay" ("cityId", "branch", "date");
CREATE INDEX IF NOT EXISTS "HomecareOpenDay_branch_date_idx" ON "HomecareOpenDay" ("branch", "date");
DO $$ BEGIN
  ALTER TABLE "HomecareOpenDay" ADD CONSTRAINT "HomecareOpenDay_cityId_fkey"
    FOREIGN KEY ("cityId") REFERENCES "HomecareCity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── HomecareClinic (per-branch PT origin coordinates) ────────────────────────
CREATE TABLE IF NOT EXISTS "HomecareClinic" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "address"   TEXT,
  "latitude"  DOUBLE PRECISION NOT NULL,
  "longitude" DOUBLE PRECISION NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomecareClinic_pkey" PRIMARY KEY ("id")
);

-- ── HomecareSettings (singleton fare config, id = "default") ─────────────────
CREATE TABLE IF NOT EXISTS "HomecareSettings" (
  "id"                  TEXT NOT NULL,
  "sessionFee"          DECIMAL(65,30) NOT NULL DEFAULT 2000,
  "baseFare"            DECIMAL(65,30) NOT NULL DEFAULT 70,
  "baseKm"              DOUBLE PRECISION NOT NULL DEFAULT 2,
  "shortRatePerKm"      DECIMAL(65,30) NOT NULL DEFAULT 20,
  "shortMaxKm"          DOUBLE PRECISION NOT NULL DEFAULT 7,
  "longRatePerKm"       DECIMAL(65,30) NOT NULL DEFAULT 20,
  "surge"               JSONB NOT NULL DEFAULT '[]',
  "surgeCap"            DOUBLE PRECISION NOT NULL DEFAULT 2,
  "defaultTransportFee" DECIMAL(65,30),
  "orsEnabled"          BOOLEAN NOT NULL DEFAULT true,
  "updatedAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HomecareSettings_pkey" PRIMARY KEY ("id")
);

-- ── PatientBooking: homecare fields (all nullable; source == "HOMECARE") ─────
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "homecareCityId"    TEXT;
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "homecareOpenDayId" TEXT;
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "serviceAddress"    TEXT;
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "serviceLat"        DOUBLE PRECISION;
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "serviceLng"        DOUBLE PRECISION;
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "distanceKm"        DOUBLE PRECISION;
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "transportFee"      DECIMAL(65,30);
ALTER TABLE "PatientBooking" ADD COLUMN IF NOT EXISTS "surgeMultiplier"   DOUBLE PRECISION;
CREATE INDEX IF NOT EXISTS "PatientBooking_homecareOpenDayId_idx" ON "PatientBooking" ("homecareOpenDayId");
