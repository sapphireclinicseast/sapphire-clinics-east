-- A patient attached to a clinician with NO day and NO hour.
--
-- Some work does not sit in an hour on a board. An annulment evaluation runs
-- over whatever sittings it needs, arranged between the psychologist and the
-- family; the clinic still has to know whose case it is.
--
-- Deliberately NOT a DeckingSlot with the time left blank: every part of this
-- module reads a slot as an hour, so a row with no hour would be drawn
-- somewhere, counted as something, and would distort the fill rate for work
-- that occupies no time on the board at all.
--
-- Guarded throughout — the deploy replays every migration on every run.
CREATE TABLE IF NOT EXISTS "DeckingCaseload" (
  "id"          TEXT NOT NULL,
  "staffId"     TEXT NOT NULL,
  "patientId"   TEXT NOT NULL,
  "branch"      TEXT NOT NULL,
  "department"  TEXT NOT NULL,
  "paymentType" TEXT NOT NULL DEFAULT 'CASH',
  "hmoProvider" TEXT,
  "reason"      TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeckingCaseload_pkey" PRIMARY KEY ("id")
);

-- One entry per patient per clinician. Twice is a mistake, not two cases.
CREATE UNIQUE INDEX IF NOT EXISTS "DeckingCaseload_staffId_patientId_key"
  ON "DeckingCaseload" ("staffId", "patientId");
CREATE INDEX IF NOT EXISTS "DeckingCaseload_branch_department_idx"
  ON "DeckingCaseload" ("branch", "department");

DO $$ BEGIN
  ALTER TABLE "DeckingCaseload" ADD CONSTRAINT "DeckingCaseload_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "DeckingCaseload" ADD CONSTRAINT "DeckingCaseload_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
