-- Homecare open days: patients now choose a specific visit TIME. Replace the
-- per-day "capacity" with "slotMinutes" (minutes reserved per visit incl. travel);
-- bookable start times are generated from startTime→endTime stepping by it.
-- Existing rows keep their weekday/branch/window and default to 120 min. Idempotent.

ALTER TABLE "HomecareOpenDay" ADD COLUMN IF NOT EXISTS "slotMinutes" INTEGER NOT NULL DEFAULT 120;
ALTER TABLE "HomecareOpenDay" DROP COLUMN IF EXISTS "capacity";
