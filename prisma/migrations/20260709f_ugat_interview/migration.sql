-- UGAT Phase 2: interviews (slots, bookings, decisions) + stage deadlines.
-- Idempotent (replayed every deploy with ON_ERROR_STOP=0).

-- Interview fields on the application.
ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "interviewSlotId"       TEXT;
ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "interviewAt"           TIMESTAMP(3);
ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "interviewDurationMins" INTEGER;
ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "jitsiUrl"              TEXT;
ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "interviewDecision"     TEXT NOT NULL DEFAULT 'PENDING';
ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "rejectionEmailedAt"    TIMESTAMP(3);
CREATE INDEX IF NOT EXISTS "UgatApplication_interviewDecision_idx" ON "UgatApplication" ("interviewDecision");

-- Stage deadlines on the cycle.
ALTER TABLE "UgatApplicationCycle" ADD COLUMN IF NOT EXISTS "initialDeadline"   TIMESTAMP(3);
ALTER TABLE "UgatApplicationCycle" ADD COLUMN IF NOT EXISTS "interviewDeadline" TIMESTAMP(3);

-- Interview slots.
CREATE TABLE IF NOT EXISTS "UgatInterviewSlot" (
  "id"           TEXT NOT NULL,
  "startsAt"     TIMESTAMP(3) NOT NULL,
  "durationMins" INTEGER NOT NULL DEFAULT 30,
  "capacity"     INTEGER NOT NULL DEFAULT 1,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatInterviewSlot_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UgatInterviewSlot_startsAt_idx" ON "UgatInterviewSlot" ("startsAt");
