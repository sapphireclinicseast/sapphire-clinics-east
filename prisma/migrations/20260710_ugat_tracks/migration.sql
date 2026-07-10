-- UGAT: Aral / Tindig application tracks. Idempotent.
ALTER TABLE "UgatApplication" ADD COLUMN IF NOT EXISTS "track" TEXT NOT NULL DEFAULT 'ARAL';
CREATE INDEX IF NOT EXISTS "UgatApplication_track_idx" ON "UgatApplication" ("track");
