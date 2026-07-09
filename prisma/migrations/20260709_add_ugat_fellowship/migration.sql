-- UGAT Fellowship Program — scholar hub tables.
-- Idempotent: the VPS deploy replays every migration.sql with ON_ERROR_STOP=0,
-- so guards (IF NOT EXISTS / DO $$ ... EXCEPTION) let this re-run safely.

-- ── Enum: UgatOptionKind ────────────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE "UgatOptionKind" AS ENUM ('SCHOOL', 'PROGRAM', 'FIELD');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── UgatOption (editable signup dropdowns) ──────────────────────────
CREATE TABLE IF NOT EXISTS "UgatOption" (
  "id"         TEXT NOT NULL,
  "kind"       "UgatOptionKind" NOT NULL,
  "label"      TEXT NOT NULL,
  "sortOrder"  INTEGER NOT NULL DEFAULT 0,
  "disabledAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatOption_kind_label_key" ON "UgatOption" ("kind", "label");
CREATE INDEX IF NOT EXISTS "UgatOption_kind_disabledAt_sortOrder_idx" ON "UgatOption" ("kind", "disabledAt", "sortOrder");

-- ── UgatScholar ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UgatScholar" (
  "id"                     TEXT NOT NULL,
  "email"                  TEXT NOT NULL,
  "passwordHash"           TEXT NOT NULL,
  "firstName"              TEXT NOT NULL,
  "middleName"             TEXT,
  "lastName"               TEXT NOT NULL,
  "studentNumber"          TEXT NOT NULL,
  "expectedGraduationYear" INTEGER NOT NULL,
  "birthdate"              TIMESTAMP(3) NOT NULL,
  "school"                 TEXT NOT NULL,
  "program"                TEXT NOT NULL,
  "preferredField"         TEXT NOT NULL,
  "permAddress1"           TEXT NOT NULL,
  "permAddress2"           TEXT,
  "permCity"               TEXT NOT NULL,
  "permRegion"             TEXT NOT NULL,
  "permZip"                TEXT NOT NULL,
  "presSameAsPerm"         BOOLEAN NOT NULL DEFAULT false,
  "presAddress1"           TEXT NOT NULL,
  "presAddress2"           TEXT,
  "presCity"               TEXT NOT NULL,
  "presRegion"             TEXT NOT NULL,
  "presZip"                TEXT NOT NULL,
  "emailVerifiedAt"        TIMESTAMP(3),
  "disabledAt"             TIMESTAMP(3),
  "disabledBy"             TEXT,
  "createdAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"              TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatScholar_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatScholar_email_key" ON "UgatScholar" ("email");
CREATE INDEX IF NOT EXISTS "UgatScholar_emailVerifiedAt_idx" ON "UgatScholar" ("emailVerifiedAt");
CREATE INDEX IF NOT EXISTS "UgatScholar_disabledAt_idx" ON "UgatScholar" ("disabledAt");

-- ── UgatVerificationToken ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UgatVerificationToken" (
  "id"         TEXT NOT NULL,
  "scholarId"  TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatVerificationToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatVerificationToken_token_key" ON "UgatVerificationToken" ("token");
CREATE INDEX IF NOT EXISTS "UgatVerificationToken_scholarId_idx" ON "UgatVerificationToken" ("scholarId");

DO $$ BEGIN
  ALTER TABLE "UgatVerificationToken"
    ADD CONSTRAINT "UgatVerificationToken_scholarId_fkey"
    FOREIGN KEY ("scholarId") REFERENCES "UgatScholar" ("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- ── Seed default dropdown options (admin can edit later) ─────────────
INSERT INTO "UgatOption" ("id", "kind", "label", "sortOrder") VALUES
  ('ugat_sch_ust',   'SCHOOL', 'University of Santo Tomas', 10),
  ('ugat_sch_upm',   'SCHOOL', 'University of the Philippines Manila', 20),
  ('ugat_sch_dlsmhsi','SCHOOL', 'De La Salle Medical and Health Sciences Institute', 30),
  ('ugat_sch_cdu',   'SCHOOL', 'Cebu Doctors'' University', 40),
  ('ugat_sch_velez', 'SCHOOL', 'Velez College', 50),
  ('ugat_sch_eac',   'SCHOOL', 'Emilio Aguinaldo College', 60),
  ('ugat_sch_olfu',  'SCHOOL', 'Our Lady of Fatima University', 70),
  ('ugat_sch_auf',   'SCHOOL', 'Angeles University Foundation', 80),
  ('ugat_sch_uerm',  'SCHOOL', 'UERM Memorial Medical Center', 90),
  ('ugat_sch_uphsd', 'SCHOOL', 'University of Perpetual Help System DALTA', 100)
ON CONFLICT ("kind", "label") DO NOTHING;

INSERT INTO "UgatOption" ("id", "kind", "label", "sortOrder") VALUES
  ('ugat_prog_pt',   'PROGRAM', 'Physical Therapy', 10),
  ('ugat_prog_ot',   'PROGRAM', 'Occupational Therapy', 20),
  ('ugat_prog_slp',  'PROGRAM', 'Speech-Language Pathology', 30),
  ('ugat_prog_nurse','PROGRAM', 'Nursing', 40),
  ('ugat_prog_nutri','PROGRAM', 'Nutrition and Dietetics', 50),
  ('ugat_prog_medtech','PROGRAM', 'Medical Technology / Medical Laboratory Science', 60),
  ('ugat_prog_psych','PROGRAM', 'Psychology', 70),
  ('ugat_prog_resp', 'PROGRAM', 'Respiratory Therapy', 80),
  ('ugat_prog_radtech','PROGRAM', 'Radiologic Technology', 90),
  ('ugat_prog_pharma','PROGRAM', 'Pharmacy', 100)
ON CONFLICT ("kind", "label") DO NOTHING;

INSERT INTO "UgatOption" ("id", "kind", "label", "sortOrder") VALUES
  ('ugat_fld_peds',  'FIELD', 'Pediatrics', 10),
  ('ugat_fld_devpeds','FIELD', 'Developmental Pediatrics', 20),
  ('ugat_fld_geri',  'FIELD', 'Geriatrics', 30),
  ('ugat_fld_neuro', 'FIELD', 'Neurorehabilitation', 40),
  ('ugat_fld_ortho', 'FIELD', 'Orthopedics / Musculoskeletal', 50),
  ('ugat_fld_sports','FIELD', 'Sports Rehabilitation', 60),
  ('ugat_fld_mental','FIELD', 'Mental Health', 70),
  ('ugat_fld_school','FIELD', 'School-Based Practice', 80),
  ('ugat_fld_comm',  'FIELD', 'Community / Home Health', 90),
  ('ugat_fld_acute', 'FIELD', 'Acute / Hospital Care', 100)
ON CONFLICT ("kind", "label") DO NOTHING;
