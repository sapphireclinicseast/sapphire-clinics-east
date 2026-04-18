-- AlterTable: add firstDayOfConsult to Patient
-- This is the manually set "First Day of Consult/Session" used as the basis
-- for cancellation reset every 6 months and follow-up rules per profession.
-- If left NULL, the first recorded session date is used instead.

ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "firstDayOfConsult" TIMESTAMP;
