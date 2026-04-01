-- Incentive Rules for payroll
-- Configurable threshold-based daily patient bonuses

CREATE TABLE IF NOT EXISTS "IncentiveRule" (
  "id"           TEXT          NOT NULL,
  "name"         TEXT          NOT NULL,
  "description"  TEXT,
  "threshold"    INTEGER       NOT NULL,
  "bonusPerUnit" DECIMAL(65,30) NOT NULL,
  "departments"  JSONB         NOT NULL DEFAULT '[]',
  "branch"       TEXT,
  "isActive"     BOOLEAN       NOT NULL DEFAULT true,
  "createdById"  TEXT          NOT NULL,
  "createdAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IncentiveRule_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "IncentiveRule"
  ADD CONSTRAINT "IncentiveRule_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "IncentiveRule_isActive_idx" ON "IncentiveRule"("isActive");
CREATE INDEX IF NOT EXISTS "IncentiveRule_branch_idx"   ON "IncentiveRule"("branch");
