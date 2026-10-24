-- Public enquiry inbox (Inquiry + InquiryMessage).
--
-- The marketing-hub deploy replays every migration on every deploy and has no
-- migration tracker, so this must stay idempotent.

DO $$ BEGIN
  CREATE TYPE "InquiryStatus" AS ENUM ('OPEN', 'ANSWERED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "Inquiry" (
  "id"            TEXT PRIMARY KEY,
  "ref"           TEXT NOT NULL,
  "token"         TEXT NOT NULL,
  "branch"        TEXT NOT NULL,
  "name"          TEXT NOT NULL,
  "email"         TEXT,
  "phone"         TEXT,
  "subject"       TEXT,
  "status"        "InquiryStatus" NOT NULL DEFAULT 'OPEN',
  "readAt"        TIMESTAMP(3),
  "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "InquiryMessage" (
  "id"         TEXT PRIMARY KEY,
  "inquiryId"  TEXT NOT NULL,
  "fromStaff"  BOOLEAN NOT NULL DEFAULT false,
  "authorName" TEXT,
  "body"       TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "Inquiry_ref_key"   ON "Inquiry"("ref");
CREATE UNIQUE INDEX IF NOT EXISTS "Inquiry_token_key" ON "Inquiry"("token");
CREATE INDEX IF NOT EXISTS "Inquiry_branch_status_idx"        ON "Inquiry"("branch", "status");
CREATE INDEX IF NOT EXISTS "Inquiry_branch_lastMessageAt_idx" ON "Inquiry"("branch", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "InquiryMessage_inquiryId_createdAt_idx" ON "InquiryMessage"("inquiryId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "InquiryMessage"
    ADD CONSTRAINT "InquiryMessage_inquiryId_fkey"
    FOREIGN KEY ("inquiryId") REFERENCES "Inquiry"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
