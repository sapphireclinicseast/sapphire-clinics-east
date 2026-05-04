-- Persist incentive bonuses on locked PayrollEntry rows so the payslip
-- PDF can render them and tax/net are computed from the same numbers
-- the accountant sees in the live preview. Columns were already
-- declared in schema.prisma but never migrated to the live DB.
ALTER TABLE "PayrollEntry"
  ADD COLUMN IF NOT EXISTS "incentives"     JSONB     NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS "incentiveTotal" NUMERIC(65, 30) NOT NULL DEFAULT 0;
