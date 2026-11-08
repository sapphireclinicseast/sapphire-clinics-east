-- Per-account read state for enquiries.
--
-- Inquiry.readAt is one timestamp on the thread, so the first person to open an
-- enquiry marked it read for everybody — a main admin skimming the inbox
-- cleared the dot for the front desk who was meant to answer it. This table
-- records who opened what, and the badge is computed per account.
--
-- Guarded with IF NOT EXISTS throughout: this deploy replays every migration on
-- every run with no tracker, so each one has to be safe to re-apply.

CREATE TABLE IF NOT EXISTS "InquiryRead" (
  "id"        TEXT         NOT NULL,
  "inquiryId" TEXT         NOT NULL,
  "userId"    TEXT         NOT NULL,
  "readAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InquiryRead_pkey" PRIMARY KEY ("id")
);

-- One row per (enquiry, reader). The unique index is what makes the upsert on
-- open safe against two tabs opening the same thread at once.
CREATE UNIQUE INDEX IF NOT EXISTS "InquiryRead_inquiryId_userId_key"
  ON "InquiryRead"("inquiryId", "userId");
CREATE INDEX IF NOT EXISTS "InquiryRead_userId_idx" ON "InquiryRead"("userId");

-- Cascades: a deleted enquiry or a deleted staff account takes its read marks
-- with it. Added separately and guarded, because ADD CONSTRAINT has no
-- IF NOT EXISTS.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InquiryRead_inquiryId_fkey'
  ) THEN
    ALTER TABLE "InquiryRead"
      ADD CONSTRAINT "InquiryRead_inquiryId_fkey"
      FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InquiryRead_userId_fkey'
  ) THEN
    ALTER TABLE "InquiryRead"
      ADD CONSTRAINT "InquiryRead_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- No backfill.
--
-- Threads already answered or closed are not unread under the new rule whoever
-- has read them, so they need no rows. What that leaves is enquiries still
-- OPEN that somebody opened without replying — and those SHOULD come back as
-- unread: an open enquiry nobody answered is exactly what the old shared flag
-- was hiding. Inventing read marks for every account to keep the badge at zero
-- would re-hide them on the one deploy where they could resurface.
