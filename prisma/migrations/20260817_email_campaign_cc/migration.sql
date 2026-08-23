-- AlterTable
-- Address(es) that receive a single copy of the campaign when it starts
-- sending. Comma-separated; nullable = no copy requested.
ALTER TABLE "EmailCampaign" ADD COLUMN IF NOT EXISTS "ccEmails" TEXT;
