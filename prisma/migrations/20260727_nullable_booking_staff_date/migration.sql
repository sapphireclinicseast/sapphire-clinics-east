-- Make staffId and date nullable on PatientBooking so teletherapy bookings
-- can be created from the client portal before a therapist and time are assigned.
-- The front desk uses the Decking Module to assign staff + time later.

ALTER TABLE "PatientBooking" ALTER COLUMN "staffId" DROP NOT NULL;
ALTER TABLE "PatientBooking" ALTER COLUMN "date" DROP NOT NULL;
