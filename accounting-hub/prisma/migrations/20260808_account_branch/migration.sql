-- A bank account belongs to one branch. Bank statements are whole-account and
-- cannot be split, so a branch view needs to know which accounts are its own
-- before it can state cash at the bank.
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "branch" "Branch";

-- Backfill from the title prefix, which is how the accounts are already named.
-- Only touch rows still unset, so a hand correction in Chart of Accounts is
-- never overwritten by a later redeploy replaying this migration.
UPDATE "Account" SET "branch" = 'SANDBOX_EAST'
  WHERE "branch" IS NULL AND "isBankAccount" = true AND "accountTitle" ILIKE 'AHEA %';
UPDATE "Account" SET "branch" = 'SANDBOX_GREENHILLS'
  WHERE "branch" IS NULL AND "isBankAccount" = true AND "accountTitle" ILIKE 'AHGH %';
UPDATE "Account" SET "branch" = 'VERDANA_STORE'
  WHERE "branch" IS NULL AND "isBankAccount" = true AND "accountTitle" ILIKE 'VER %';

CREATE INDEX IF NOT EXISTS "Account_branch_idx" ON "Account"("branch");
