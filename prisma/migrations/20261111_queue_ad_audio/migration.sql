-- Sound on the queue TV adverts, and the slide-duration column Prisma never knew about.
--
-- adSlideDuration already exists in the live database — it was added when the
-- Ads Manager gained the control, but never written into schema.prisma, so the
-- generated client had no such field: every read fell through to the default of
-- 12 and every save threw. IF NOT EXISTS makes this a no-op there and creates
-- it on any database that is genuinely missing it.
--
-- Guarded throughout — the deploy replays every migration on every run.
ALTER TABLE "SurveySettings" ADD COLUMN IF NOT EXISTS "adSlideDuration" INTEGER NOT NULL DEFAULT 12;
ALTER TABLE "SurveySettings" ADD COLUMN IF NOT EXISTS "adAudio" BOOLEAN NOT NULL DEFAULT false;
