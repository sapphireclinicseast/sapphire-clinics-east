-- Preferred shares are paid for the same way as common shares and need the same
-- bank-reconciliation tagging, so a deposit may belong to either. Exactly one of the
-- two is set; a CHECK constraint and the API both enforce that.
-- Re-run safe: the deploy replays every migration file on each deploy.
ALTER TABLE "EquityDeposit" ALTER COLUMN "commonShareId" DROP NOT NULL;
ALTER TABLE "EquityDeposit" ADD COLUMN IF NOT EXISTS "preferredShareId" TEXT;

DO $$ BEGIN
  ALTER TABLE "EquityDeposit" ADD CONSTRAINT "EquityDeposit_preferredShareId_fkey"
    FOREIGN KEY ("preferredShareId") REFERENCES "PreferredShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "EquityDeposit_preferredShareId_idx" ON "EquityDeposit"("preferredShareId");

-- A deposit must hang off exactly one holding.
DO $$ BEGIN
  ALTER TABLE "EquityDeposit" ADD CONSTRAINT "EquityDeposit_one_holding"
    CHECK (("commonShareId" IS NOT NULL) <> ("preferredShareId" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
