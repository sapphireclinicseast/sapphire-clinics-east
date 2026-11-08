-- A specific date on a decking slot, for sessions that do not recur weekly.
--
-- NULL = the standing weekly pattern, which is every row that exists today and
-- stays the right model for OT, PT, SLP and SPED. Psychology and MD are
-- episodic: front desk keep those boards as dated blocks, the same clinician
-- appearing twice in one week. Held as a weekly slot, a one-off on 12 November
-- claims every Thursday for ever — and inflates every capacity figure the hub
-- reports for that department.
--
-- Guarded with IF NOT EXISTS: this deploy replays every migration on every run
-- with no tracker, so each one has to be safe to re-apply.

ALTER TABLE "DeckingSlot" ADD COLUMN IF NOT EXISTS "date" TIMESTAMP(3);

-- The weekly board reads WHERE "date" IS NULL on every query, so that is the
-- shape of the index. A partial index also stays small: the dated rows are a
-- minority and always will be.
CREATE INDEX IF NOT EXISTS "DeckingSlot_weekly_idx"
  ON "DeckingSlot"("branch", "department", "dayOfWeek")
  WHERE "date" IS NULL;

-- And the dated lookups, for the psych/MD boards.
CREATE INDEX IF NOT EXISTS "DeckingSlot_dated_idx"
  ON "DeckingSlot"("branch", "department", "date")
  WHERE "date" IS NOT NULL;

-- No backfill: every existing row is weekly, which NULL already says.
