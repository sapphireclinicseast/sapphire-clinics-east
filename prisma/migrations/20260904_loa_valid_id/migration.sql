-- Valid ID (showing the patient's signature) attached to an LOA submission.
-- Guarded: every deploy replays the full migration folder, so this has to be
-- safe to run against a database that already has the columns.
ALTER TABLE "LoaSubmission" ADD COLUMN IF NOT EXISTS "idFileUrl" TEXT;
ALTER TABLE "LoaSubmission" ADD COLUMN IF NOT EXISTS "idFileMime" TEXT;
