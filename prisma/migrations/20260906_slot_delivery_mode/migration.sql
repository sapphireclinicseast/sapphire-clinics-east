-- How a decked session is delivered. NULL = unclassified (every row before this).
-- Guarded: the full migration folder replays on every deploy.
ALTER TABLE "DeckingSlot" ADD COLUMN IF NOT EXISTS "deliveryMode" TEXT;
CREATE INDEX IF NOT EXISTS "DeckingSlot_deliveryMode_idx" ON "DeckingSlot"("deliveryMode");
