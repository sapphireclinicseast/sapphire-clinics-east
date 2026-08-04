-- Preferred shares are paid for the same way as common shares and need the same
-- bank-reconciliation tagging, so a deposit may belong to either. Exactly one of the
-- two is set; the API enforces that. commonShareId becomes nullable to allow it.
ALTER TABLE "EquityDeposit" ALTER COLUMN "commonShareId" DROP NOT NULL;
ALTER TABLE "EquityDeposit" ADD COLUMN "preferredShareId" TEXT;
ALTER TABLE "EquityDeposit" ADD CONSTRAINT "EquityDeposit_preferredShareId_fkey"
  FOREIGN KEY ("preferredShareId") REFERENCES "PreferredShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX "EquityDeposit_preferredShareId_idx" ON "EquityDeposit"("preferredShareId");
-- A deposit must hang off exactly one holding.
ALTER TABLE "EquityDeposit" ADD CONSTRAINT "EquityDeposit_one_holding"
  CHECK (("commonShareId" IS NOT NULL) <> ("preferredShareId" IS NOT NULL));
