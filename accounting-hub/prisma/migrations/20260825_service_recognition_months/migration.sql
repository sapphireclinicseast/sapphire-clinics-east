-- Period-fee revenue recognition: a service tagged recognitionMonths > 1
-- (tuition ANNUAL = 10 school months, BIANNUAL = 5) has its revenue spread
-- by the reports engine over that many months starting the transaction month.
-- Applied to production manually on 2026-08-25 before the code deploy.
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "recognitionMonths" INTEGER;
