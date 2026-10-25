-- Link an enquiry to a patient record. Replayed on every deploy, so guarded.
ALTER TABLE "Inquiry" ADD COLUMN IF NOT EXISTS "patientId" TEXT;
CREATE INDEX IF NOT EXISTS "Inquiry_patientId_lastMessageAt_idx" ON "Inquiry"("patientId", "lastMessageAt");
DO $$ BEGIN
  ALTER TABLE "Inquiry" ADD CONSTRAINT "Inquiry_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
