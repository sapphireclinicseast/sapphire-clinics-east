-- Who supervises an intern's decking slot.
--
-- A reference, not a booking. A clinical supervisor can be treating their own
-- patient while overseeing a student, so their hour stays bookable and the
-- intern's slot is capacity of its own. Recording it as a second booking would
-- close an hour the clinic can still sell.
--
-- Guarded with IF NOT EXISTS: this deploy replays every migration on every run
-- with no tracker.

ALTER TABLE "DeckingSlot" ADD COLUMN IF NOT EXISTS "supervisorId" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DeckingSlot_supervisorId_fkey') THEN
    ALTER TABLE "DeckingSlot"
      ADD CONSTRAINT "DeckingSlot_supervisorId_fkey"
      FOREIGN KEY ("supervisorId") REFERENCES "Staff"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DeckingSlot_supervisorId_idx" ON "DeckingSlot"("supervisorId");
