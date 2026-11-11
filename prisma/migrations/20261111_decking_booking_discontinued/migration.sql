-- A child left behind by a departed consultant whose family is not continuing.
--
-- A tag beside the booking, never a deletion: families come back, and the slot
-- is the only record of what they were having and when. Deleting would also
-- make the decision invisible — the row would vanish and the next person would
-- not know whether it was moved, dropped, or lost.
--
-- Guarded throughout — the deploy replays every migration on every run.
CREATE TABLE IF NOT EXISTS "DeckingBookingDiscontinued" (
    "id"        TEXT NOT NULL,
    "slotId"    TEXT NOT NULL,
    "patientId" TEXT,
    "branch"    TEXT NOT NULL,
    "remarks"   TEXT NOT NULL DEFAULT '',
    "setByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeckingBookingDiscontinued_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DeckingBookingDiscontinued_slotId_key"
    ON "DeckingBookingDiscontinued"("slotId");
CREATE INDEX IF NOT EXISTS "DeckingBookingDiscontinued_branch_idx"
    ON "DeckingBookingDiscontinued"("branch");
