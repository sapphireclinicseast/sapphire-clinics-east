-- Payment type per decking slot, so front desk can colour-code the board by
-- what needs paperwork chased (HMO / GL) versus what does not (cash).
--
-- Guarded: this deploy replays every migration on every run.
ALTER TABLE "DeckingSlot" ADD COLUMN IF NOT EXISTS "paymentType" TEXT NOT NULL DEFAULT 'CASH';
CREATE INDEX IF NOT EXISTS "DeckingSlot_paymentType_idx" ON "DeckingSlot"("paymentType");
