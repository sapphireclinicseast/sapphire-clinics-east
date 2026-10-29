-- Bell-icon notifications for the class portal.
--
-- One row per (recipient, event). Written by trigger-point helpers in
-- src/lib/class-portal-notifications.ts whenever an announcement is
-- posted, a payment is confirmed, class content changes, or a
-- promissory note is uploaded. The recipient-side GET endpoint lists
-- unread + recent; a PATCH marks a row as read when the user clicks
-- through from the bell dropdown.
--
-- Guarded with IF NOT EXISTS so the migration folder replays on every
-- deploy without erroring.

DO $$ BEGIN
    CREATE TYPE "ClassPortalNotificationKind" AS ENUM (
        'ANNOUNCEMENT',
        'PAYMENT_DUE',
        'PAYMENT_RECEIVED',
        'PROMISSORY_NOTE',
        'CLASS_LESSON',
        'CLASS_ACTIVITY',
        'CLASS_ASSIGNMENT',
        'CLASS_PROJECT',
        'CLASS_PHOTO',
        'PENDING_PAYMENT'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "ClassPortalNotification" (
    "id"          TEXT PRIMARY KEY,
    "userId"      TEXT NOT NULL,
    "kind"        "ClassPortalNotificationKind" NOT NULL,
    "title"       TEXT NOT NULL,
    "body"        TEXT NOT NULL,
    "href"        TEXT,
    "payloadJson" JSONB,
    "readAt"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassPortalNotification_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "ClassPortalUser"("id")
        ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ClassPortalNotification_userId_createdAt_idx"
    ON "ClassPortalNotification" ("userId", "createdAt" DESC);

CREATE INDEX IF NOT EXISTS "ClassPortalNotification_userId_readAt_idx"
    ON "ClassPortalNotification" ("userId", "readAt");
