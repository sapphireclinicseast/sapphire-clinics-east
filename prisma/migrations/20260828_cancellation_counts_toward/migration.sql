-- Reschedules must not count toward the cancellation allowance or slot removal,
-- and front desk needs to be able to waive a specific cancellation as it is logged.
--
-- Both are recorded here rather than inferred: reschedules and cancellations share
-- one `type` vocabulary ("Cancellation >24 hrs (VALID)" is written for both), so
-- nothing in the existing row says which one it was.

ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "sourceStatus"  TEXT;
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "countsToward"  BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "excludeReason" TEXT;

-- Backfill from the session the log came from. Logs written by a Clinic Schedule
-- status change carry scheduleId, so the schedule's own status is authoritative
-- about what actually happened. Only fills rows still NULL, so re-running this
-- migration (the deploy replays every migration on every run) can't overwrite a
-- value set later by the app.
UPDATE "CancellationLog" cl
   SET "sourceStatus" = s."status"::text
  FROM "Schedule" s
 WHERE cl."scheduleId" = s."id"
   AND cl."sourceStatus" IS NULL
   AND s."status"::text IN ('CANCELLED', 'RESCHEDULED');

-- Manually-typed logs have no scheduleId and therefore no evidence either way.
-- They are deliberately left NULL rather than guessed at: the read path treats
-- NULL as a cancellation, which preserves today's counts for those rows instead
-- of silently reducing someone's total.

CREATE INDEX IF NOT EXISTS "CancellationLog_sourceStatus_idx" ON "CancellationLog"("sourceStatus");
CREATE INDEX IF NOT EXISTS "CancellationLog_countsToward_idx" ON "CancellationLog"("countsToward");
