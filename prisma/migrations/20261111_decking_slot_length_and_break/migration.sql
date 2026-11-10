-- A day told as a LENGTH rather than as a count, and a break in the middle.
--
-- Front desk are told a count — "Dr Lim sees 5 on a Wednesday" — and the
-- window is divided backwards into that many. A doctor is told a length —
-- "two hours each, and an hour for lunch" — and that cannot be said as a
-- count: Dr Colet's 9:30-16:30 split four ways is 1h45 a patient and lands her
-- consults at 11:15 and 14:45, which is not her day, and leaves the lunch
-- break in the wrong place.
--
-- NULL on all three is what every row meant before this: one patient per whole
-- hour, or the count in slotsPerDay. No backfill.
--
-- Guarded — the deploy replays every migration on every run.
ALTER TABLE "DeckingTherapistConfig" ADD COLUMN IF NOT EXISTS "slotMinutes" INTEGER;
ALTER TABLE "DeckingTherapistConfig" ADD COLUMN IF NOT EXISTS "breakStart" TEXT;
ALTER TABLE "DeckingTherapistConfig" ADD COLUMN IF NOT EXISTS "breakMinutes" INTEGER;
