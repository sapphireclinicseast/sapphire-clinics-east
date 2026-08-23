-- Interbranch clinicians (e.g. an OT who is primary at one branch and also
-- works at the other) previously could have only ONE DeckingTherapistConfig
-- row total, keyed uniquely on staffId. Saving a schedule for their secondary
-- branch silently overwrote their primary-branch config instead of creating
-- a second one. Relax the unique key to (staffId, branch) so each branch gets
-- its own independent weekly-schedule config.
DROP INDEX IF EXISTS "DeckingTherapistConfig_staffId_key";
CREATE UNIQUE INDEX IF NOT EXISTS "DeckingTherapistConfig_staffId_branch_key"
  ON "DeckingTherapistConfig"("staffId", "branch");
