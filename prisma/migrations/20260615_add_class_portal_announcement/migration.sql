-- Server-backed school announcements with optional inline poster image.
-- Idempotent so the migrate container can re-run safely.

CREATE TABLE IF NOT EXISTS "ClassPortalAnnouncement" (
  "id"               TEXT PRIMARY KEY,
  "title"            TEXT NOT NULL,
  "body"             TEXT NOT NULL,
  "levels"           TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "includeTeachers"  BOOLEAN NOT NULL DEFAULT FALSE,
  "authorRole"       TEXT NOT NULL,
  "authorEmail"      TEXT NOT NULL,
  "authorName"       TEXT NOT NULL,
  "posterFileName"   TEXT,
  "posterFileType"   TEXT,
  "posterFileSize"   INTEGER,
  "posterFileData"   BYTEA,
  "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ClassPortalAnnouncement_createdAt_idx"   ON "ClassPortalAnnouncement"("createdAt");
CREATE INDEX IF NOT EXISTS "ClassPortalAnnouncement_authorEmail_idx" ON "ClassPortalAnnouncement"("authorEmail");
