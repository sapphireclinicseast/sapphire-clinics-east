-- UGAT landing-page announcements (title + details), managed by admins.
CREATE TABLE IF NOT EXISTS "UgatAnnouncement" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "details" TEXT NOT NULL,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UgatAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UgatAnnouncement_published_createdAt_idx"
    ON "UgatAnnouncement"("published", "createdAt");
