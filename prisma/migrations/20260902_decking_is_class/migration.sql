-- SPED classes are a different booking from 1-on-1 SPED therapy. Both carry
-- department = 'SPED', so department alone cannot separate them.
--
-- Defaults false: every row that exists today was created as a 1-on-1.
-- Guarded — the deploy replays every migration on every run.
ALTER TABLE "DeckingSlot" ADD COLUMN IF NOT EXISTS "isClass" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "DeckingSlot_isClass_idx" ON "DeckingSlot"("isClass");
