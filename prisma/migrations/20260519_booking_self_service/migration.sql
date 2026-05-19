-- Self-service booking flow: front desk no longer approves; patient pays
-- immediately at booking creation. Two per-row follow-up flags:
--   addedToDeck         — "Add to Staff Deck" button toggles this true after
--                          a DeckingSlot is created from the booking.
--   accountingRecorded  — "Recorded DP in Accounting Hub" button toggles
--                          this true once the front desk has confirmed the
--                          downpayment was logged in accounting-hub.
ALTER TABLE "PatientBooking"
  ADD COLUMN IF NOT EXISTS "addedToDeck"        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "accountingRecorded" BOOLEAN NOT NULL DEFAULT false;
