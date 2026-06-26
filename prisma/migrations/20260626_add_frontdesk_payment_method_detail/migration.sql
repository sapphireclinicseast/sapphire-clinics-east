-- Add methodDetail to ClassPortalFrontDeskPayment. Carries the
-- instrument when method = FRONT_DESK_CASH ("Frontdesk payment"
-- in the UI): CASH | CREDIT_CARD | DEBIT_CARD | GCASH | PAYMAYA.
-- Null on legacy rows — display logic treats null as CASH.
-- Idempotent so the migrate container can re-run safely.

ALTER TABLE "ClassPortalFrontDeskPayment" ADD COLUMN IF NOT EXISTS "methodDetail" TEXT;
