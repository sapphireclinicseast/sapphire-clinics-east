-- Per-branch reimbursement reference counter
ALTER TABLE "PettyCashSettings" ADD COLUMN IF NOT EXISTS "nextReimbSeq" INTEGER NOT NULL DEFAULT 1;
