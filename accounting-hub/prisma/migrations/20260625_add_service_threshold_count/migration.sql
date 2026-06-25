-- Per-service control for the daily patient-threshold incentive count.
-- "thresholdCounted" = include this service in the count when running payroll.
-- "thresholdQty"     = how many sessions one unit credits (e.g. 2 for a 2-hour session).
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "thresholdCounted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "thresholdQty" INTEGER NOT NULL DEFAULT 1;

-- One-time backfill: the services that currently feed the incentive count are the
-- unit-pay-eligible ones, so pre-tick them to preserve existing behavior. Guarded
-- by a marker table so re-running this migration (the deploy replays every
-- migration.sql) never re-ticks a service an admin has since un-ticked.
CREATE TABLE IF NOT EXISTS "_ServiceThresholdBackfill" (id INTEGER PRIMARY KEY);
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "_ServiceThresholdBackfill") THEN
    UPDATE "Service" SET "thresholdCounted" = true
      WHERE "unitPayId" IS NOT NULL AND "unitPayEnabled" = true;
    INSERT INTO "_ServiceThresholdBackfill" (id) VALUES (1);
  END IF;
END $$;
