-- ── Patient Appointment Portal — client.sapphireclinicseast.org ─────────────

-- 1) Add new StaffDepartment enum values
ALTER TYPE "StaffDepartment" ADD VALUE IF NOT EXISTS 'PSYCHIATRY';
ALTER TYPE "StaffDepartment" ADD VALUE IF NOT EXISTS 'DEVELOPMENTAL_PEDIATRICIAN';

-- 1b) Add sex column to Staff (nullable; backfilled manually by HR)
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "sex" TEXT;

-- 2) BookingStatus enum
DO $$ BEGIN
  CREATE TYPE "BookingStatus" AS ENUM ('PENDING','APPROVED','PAID','REJECTED','CANCELLED','COMPLETED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 3) PatientBooking table
CREATE TABLE IF NOT EXISTS "PatientBooking" (
    "id"              TEXT PRIMARY KEY,
    "patientId"       TEXT NOT NULL,
    "staffId"         TEXT NOT NULL,
    "deckingSlotId"   TEXT,
    "branch"          TEXT NOT NULL,
    "department"      TEXT NOT NULL,
    "date"            TIMESTAMP(3) NOT NULL,
    "startTime"       TEXT NOT NULL,
    "endTime"         TEXT NOT NULL,
    "isTeletherapy"   BOOLEAN NOT NULL DEFAULT false,
    "meetLink"        TEXT,
    "notes"           TEXT,
    "status"          "BookingStatus" NOT NULL DEFAULT 'PENDING',
    "rejectionReason" TEXT,
    "downpayment"     DECIMAL(65,30),
    "approvedAt"      TIMESTAMP(3),
    "approvedBy"      TEXT,
    "paidAt"          TIMESTAMP(3),
    "source"          TEXT NOT NULL DEFAULT 'PORTAL',
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "PatientBooking_branch_department_date_idx" ON "PatientBooking"("branch","department","date");
CREATE INDEX IF NOT EXISTS "PatientBooking_status_idx"                ON "PatientBooking"("status");
CREATE INDEX IF NOT EXISTS "PatientBooking_patientId_idx"             ON "PatientBooking"("patientId");
CREATE INDEX IF NOT EXISTS "PatientBooking_staffId_date_idx"          ON "PatientBooking"("staffId","date");

DO $$ BEGIN
  ALTER TABLE "PatientBooking" ADD CONSTRAINT "PatientBooking_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PatientBooking" ADD CONSTRAINT "PatientBooking_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
  ALTER TABLE "PatientBooking" ADD CONSTRAINT "PatientBooking_deckingSlotId_fkey"
    FOREIGN KEY ("deckingSlotId") REFERENCES "DeckingSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- 4) PatientPayment table
CREATE TABLE IF NOT EXISTS "PatientPayment" (
    "id"             TEXT PRIMARY KEY,
    "bookingId"      TEXT NOT NULL UNIQUE,
    "amount"         DECIMAL(65,30) NOT NULL,
    "currency"       TEXT NOT NULL DEFAULT 'PHP',
    "paymongoLinkId" TEXT NOT NULL UNIQUE,
    "paymongoRef"    TEXT,
    "checkoutUrl"    TEXT NOT NULL,
    "status"         TEXT NOT NULL DEFAULT 'pending',
    "paidAt"         TIMESTAMP(3),
    "webhookPayload" JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"      TIMESTAMP(3) NOT NULL
);

DO $$ BEGIN
  ALTER TABLE "PatientPayment" ADD CONSTRAINT "PatientPayment_bookingId_fkey"
    FOREIGN KEY ("bookingId") REFERENCES "PatientBooking"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
