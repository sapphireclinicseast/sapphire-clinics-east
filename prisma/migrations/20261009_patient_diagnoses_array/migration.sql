-- Patient.diagnoses — one row per tagged condition.
--
-- The marketing-hub deploy replays every migration on every deploy and there is
-- no migration tracker, so this must stay idempotent.
--
-- Additive only. Patient.diagnosis keeps its current value and keeps being
-- written, because the CSV export, the external patients API, class-portal sync,
-- queueing and the profile page all still read it.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "diagnoses" TEXT[] NOT NULL DEFAULT '{}';
