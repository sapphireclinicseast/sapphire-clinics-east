-- Referrer classification: DOCTOR (default) or LAW_FIRM.
ALTER TABLE "Referrer" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'DOCTOR';
