-- Attachments on enquiry messages.
-- Replayed on every deploy with no migration tracker, so it must stay idempotent.
ALTER TABLE "InquiryMessage" ADD COLUMN IF NOT EXISTS "fileUrl"  TEXT;
ALTER TABLE "InquiryMessage" ADD COLUMN IF NOT EXISTS "fileName" TEXT;
ALTER TABLE "InquiryMessage" ADD COLUMN IF NOT EXISTS "fileMime" TEXT;
ALTER TABLE "InquiryMessage" ADD COLUMN IF NOT EXISTS "fileSize" INTEGER;
