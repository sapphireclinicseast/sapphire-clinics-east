-- No-Show as a first-class session status, and a link from the relationship
-- logs back to the session that produced them.
--
-- Until now a no-show had nowhere to go: the session stayed CONFIRMED and
-- someone had to remember to type it into Patient Relationship by hand. The
-- fee policy treats "they told us" and "they never turned up" differently, so
-- they cannot share the CANCELLED status.

-- Postgres cannot ADD VALUE inside a transaction on older versions, and the
-- value may already exist if this partially applied, so guard it.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'ScheduleStatus' AND e.enumlabel = 'NO_SHOW'
  ) THEN
    ALTER TYPE "ScheduleStatus" ADD VALUE 'NO_SHOW';
  END IF;
END
$$;

-- Nullable on purpose: manual entry predates this and stays supported, so a log
-- with no session is valid rather than an error. Indexed because the write path
-- looks up "already logged for this session?" before every insert.
ALTER TABLE "NoShowLog"      ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "scheduleId" TEXT;

CREATE INDEX IF NOT EXISTS "NoShowLog_scheduleId_idx"      ON "NoShowLog"("scheduleId");
CREATE INDEX IF NOT EXISTS "CancellationLog_scheduleId_idx" ON "CancellationLog"("scheduleId");
