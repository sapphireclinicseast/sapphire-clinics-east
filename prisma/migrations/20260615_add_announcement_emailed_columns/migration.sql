-- Track who blasted each announcement to recipients' emails and when.
-- Idempotent so the migrate container can replay safely.

ALTER TABLE "ClassPortalAnnouncement" ADD COLUMN IF NOT EXISTS "emailedAt"    TIMESTAMP(3);
ALTER TABLE "ClassPortalAnnouncement" ADD COLUMN IF NOT EXISTS "emailedBy"    TEXT;
ALTER TABLE "ClassPortalAnnouncement" ADD COLUMN IF NOT EXISTS "emailedCount" INTEGER;
