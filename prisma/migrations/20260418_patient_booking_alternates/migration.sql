-- Add alternateChoices JSONB column to PatientBooking — stores 2nd/3rd choice
-- slot options submitted by the patient. Format:
--   [ { "staffId": string, "date": "YYYY-MM-DD", "startTime": "HH:MM", "endTime": "HH:MM" }, ... ]
ALTER TABLE "PatientBooking"
  ADD COLUMN IF NOT EXISTS "alternateChoices" JSONB;
