-- LOA (HMO Letter of Authorization) submissions.
-- Every statement is guarded: deploy replays the whole migration folder, so a
-- second run must be a no-op rather than an error.

DO $$ BEGIN
  CREATE TYPE "LoaStatus" AS ENUM ('AWAITING', 'SUBMITTED', 'APPROVED', 'REJECTED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "HmoProvider" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "HmoProvider_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "HmoProvider_name_key" ON "HmoProvider"("name");
CREATE INDEX IF NOT EXISTS "HmoProvider_active_sortOrder_idx" ON "HmoProvider"("active", "sortOrder");

CREATE TABLE IF NOT EXISTS "LoaSubmission" (
  "id"             TEXT NOT NULL,
  "patientId"      TEXT,
  "patientName"    TEXT,
  "deckingSlotId"  TEXT,
  "hmoName"        TEXT NOT NULL,
  "branch"         TEXT NOT NULL,
  "dateOfApproval" TIMESTAMP(3),
  "fileUrl"        TEXT,
  "fileMime"       TEXT,
  "status"         "LoaStatus" NOT NULL DEFAULT 'AWAITING',
  "notes"          TEXT,
  "createdById"    TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoaSubmission_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoaSubmission_branch_status_idx"  ON "LoaSubmission"("branch", "status");
CREATE INDEX IF NOT EXISTS "LoaSubmission_deckingSlotId_idx"  ON "LoaSubmission"("deckingSlotId");
CREATE INDEX IF NOT EXISTS "LoaSubmission_patientId_idx"      ON "LoaSubmission"("patientId");

CREATE TABLE IF NOT EXISTS "LoaUploadToken" (
  "id"        TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "loaId"     TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoaUploadToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoaUploadToken_token_key" ON "LoaUploadToken"("token");
CREATE INDEX IF NOT EXISTS "LoaUploadToken_loaId_idx"        ON "LoaUploadToken"("loaId");

-- Foreign keys. SetNull on patient and slot so deleting either keeps the
-- paper trail for a letter that was already approved.
DO $$ BEGIN
  ALTER TABLE "LoaSubmission" ADD CONSTRAINT "LoaSubmission_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LoaSubmission" ADD CONSTRAINT "LoaSubmission_deckingSlotId_fkey"
    FOREIGN KEY ("deckingSlotId") REFERENCES "DeckingSlot"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "LoaUploadToken" ADD CONSTRAINT "LoaUploadToken_loaId_fkey"
    FOREIGN KEY ("loaId") REFERENCES "LoaSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Seed the HMO list with the providers already used across the hub, so the
-- form is usable before anyone opens settings. ON CONFLICT keeps re-runs and
-- any later renames intact.
INSERT INTO "HmoProvider" ("id", "name", "sortOrder", "updatedAt") VALUES
  ('hmo_intellicare',   'INTELLICARE',        10, NOW()),
  ('hmo_maxicare',      'MAXICARE',           20, NOW()),
  ('hmo_medicard',      'MEDICARD',           30, NOW()),
  ('hmo_philcare',      'PHILCARE',           40, NOW()),
  ('hmo_valucare',      'VALUCARE',           50, NOW()),
  ('hmo_cocolife',      'COCOLIFE',           60, NOW()),
  ('hmo_eastwest',      'EASTWEST HEALTHCARE',70, NOW()),
  ('hmo_kaiser',        'KAISER',             80, NOW()),
  ('hmo_pacific_cross', 'PACIFIC CROSS',      90, NOW()),
  ('hmo_insular',       'INSULAR HEALTH CARE',100, NOW())
ON CONFLICT ("name") DO NOTHING;

-- Services availed (tick list) — added in the same migration folder because
-- nothing has shipped yet; guarded like everything above.
ALTER TABLE "LoaSubmission" ADD COLUMN IF NOT EXISTS "services" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

CREATE TABLE IF NOT EXISTS "LoaServiceOption" (
  "id"        TEXT NOT NULL,
  "name"      TEXT NOT NULL,
  "active"    BOOLEAN NOT NULL DEFAULT true,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoaServiceOption_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "LoaServiceOption_name_key" ON "LoaServiceOption"("name");
CREATE INDEX IF NOT EXISTS "LoaServiceOption_active_sortOrder_idx" ON "LoaServiceOption"("active", "sortOrder");

-- Seed with the departments the clinic actually bills, so the tick list works
-- before anyone opens settings.
INSERT INTO "LoaServiceOption" ("id", "name", "sortOrder", "updatedAt") VALUES
  ('loasvc_ot',      'Occupational Therapy',          10, NOW()),
  ('loasvc_pt',      'Physical Therapy',              20, NOW()),
  ('loasvc_slp',     'Speech Language Pathology',     30, NOW()),
  ('loasvc_sped',    'SPED',                          40, NOW()),
  ('loasvc_psych',   'Psychology',                    50, NOW()),
  ('loasvc_md',      'Developmental Pediatrics',      60, NOW()),
  ('loasvc_rehab',   'Rehabilitation Medicine',       70, NOW()),
  ('loasvc_ortho',   'Orthosis',                      80, NOW()),
  ('loasvc_eval',    'Initial Evaluation',            90, NOW()),
  ('loasvc_consult', 'Consultation',                 100, NOW())
ON CONFLICT ("name") DO NOTHING;
