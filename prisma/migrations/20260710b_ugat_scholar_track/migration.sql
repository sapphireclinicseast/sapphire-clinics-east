-- UGAT: track chosen at sign-up (scholar level). Idempotent.
ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "track" TEXT NOT NULL DEFAULT 'ARAL';
CREATE INDEX IF NOT EXISTS "UgatScholar_track_idx" ON "UgatScholar" ("track");
