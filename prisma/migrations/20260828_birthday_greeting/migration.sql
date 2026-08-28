-- Birthday greetings actually sent, recorded server-side.
--
-- Replaces a per-browser localStorage flag that reset daily, so a patient could
-- be greeted twice: once by whoever sent it, again by anyone on another machine
-- (or the same person the next day, while "Birthdays This Week" still listed
-- them). The unique constraint is what prevents the double greeting.
CREATE TABLE IF NOT EXISTS "BirthdayGreeting" (
  "id"         TEXT NOT NULL,
  "patientId"  TEXT NOT NULL,
  "channel"    TEXT NOT NULL,
  "year"       INTEGER NOT NULL,
  "sentAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentByName" TEXT,
  "branch"     TEXT,
  CONSTRAINT "BirthdayGreeting_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "BirthdayGreeting_patientId_channel_year_key"
  ON "BirthdayGreeting"("patientId", "channel", "year");
CREATE INDEX IF NOT EXISTS "BirthdayGreeting_year_channel_idx"
  ON "BirthdayGreeting"("year", "channel");

DO $$ BEGIN
  ALTER TABLE "BirthdayGreeting" ADD CONSTRAINT "BirthdayGreeting_patientId_fkey"
    FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
