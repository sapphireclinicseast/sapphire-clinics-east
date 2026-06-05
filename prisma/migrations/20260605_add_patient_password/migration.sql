-- Optional self-service patient portal login.
-- Null = patient has no portal account yet (still works for the booking flow).
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
