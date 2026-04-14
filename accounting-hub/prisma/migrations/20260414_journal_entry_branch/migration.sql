ALTER TABLE "JournalEntry" ADD COLUMN IF NOT EXISTS "branch" TEXT NOT NULL DEFAULT 'ALL';
CREATE INDEX IF NOT EXISTS "JournalEntry_branch_idx" ON "JournalEntry"("branch");
