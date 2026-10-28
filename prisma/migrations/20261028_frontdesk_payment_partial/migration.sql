-- Partial-payment flag on ClassPortalFrontDeskPayment.
--
-- Staff can tick "Partial payment" in the Record / Edit payment modal when
-- the parent is paying in installments within the same billing period (common
-- on the Monthly plan when a parent splits ₱5,000 into two cash receipts).
-- The badge logic treats a partial-flagged row as "doesn't flip the period
-- to Paid alone" so the student's portal keeps showing Due until a non-
-- partial payment is logged that completes the balance.
--
-- Default false so every existing row continues to behave exactly as before.
-- Guarded: the migration folder replays on every deploy.
ALTER TABLE "ClassPortalFrontDeskPayment"
    ADD COLUMN IF NOT EXISTS "isPartialPayment" BOOLEAN NOT NULL DEFAULT false;
