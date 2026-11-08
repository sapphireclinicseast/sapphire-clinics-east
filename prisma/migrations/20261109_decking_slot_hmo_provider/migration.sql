-- Which HMO, on a decking slot whose payment type is HMO.
--
-- Front desk have always written this on their own sheet — "HMO – INTELLICARE"
-- rather than "HMO" — because an HMO session needs a letter of authorization
-- chased with a named insurer, and the category alone does not say who to ring.
-- The hub stored only the category, so the detail died whenever a board was
-- read back into it.
--
-- The names come from HmoProvider, mirrored from the Accounting Hub's HMO
-- digital wallets. Nullable: every existing row predates this and no value can
-- be inferred for them.
--
-- Guarded with IF NOT EXISTS: this deploy replays every migration on every run
-- with no tracker.

ALTER TABLE "DeckingSlot" ADD COLUMN IF NOT EXISTS "hmoProvider" TEXT;
