-- Add optional payment method tag (FRONT_DESK_CASH | BANK_DEPOSIT) to the
-- frontdesk-payment queue so the confirming staff knows how the parent paid.
ALTER TABLE "ClassPortalFrontDeskPayment"
    ADD COLUMN IF NOT EXISTS "method" TEXT;
