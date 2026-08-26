-- Psychology / Medical (MD) confidentiality: session notes and reports are
-- private by default (hidden from other departments and the patient in the
-- Client Hub). "Show to Others" flips this per note / per document.
-- Idempotent so replays are safe. SessionNote's table is owned by teletherapy
-- but already exists in the shared DB, so ADD COLUMN IF NOT EXISTS is safe here
-- and guarantees the column exists before the ops hub serves the new /me code.
ALTER TABLE "PatientDocument" ADD COLUMN IF NOT EXISTS "sharedWithOthers" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "SessionNote"     ADD COLUMN IF NOT EXISTS "sharedWithOthers" BOOLEAN NOT NULL DEFAULT false;
