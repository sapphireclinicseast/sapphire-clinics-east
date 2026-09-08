-- Per-service work days: a consultant can take teletherapy on different days
-- from their on-site week. NULL deliveryMode = the general schedule, which is
-- what every existing row is.
--
-- Guarded throughout: the migration folder replays on every deploy.
ALTER TABLE "DeckingTherapistConfig" ADD COLUMN IF NOT EXISTS "deliveryMode" TEXT;

-- The unique key gains the mode, or saving teletherapy days would overwrite the
-- on-site days. Postgres treats NULLs as distinct in a unique index, so the
-- general row (NULL) and each service row coexist.
DROP INDEX IF EXISTS "DeckingTherapistConfig_staffId_branch_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DeckingTherapistConfig_staffId_branch_deliveryMode_key"
  ON "DeckingTherapistConfig"("staffId", "branch", "deliveryMode");
