-- Referrer per-branch visibility scope (empty = all branches). Idempotent.
ALTER TABLE "Referrer" ADD COLUMN IF NOT EXISTS "branches" TEXT[] NOT NULL DEFAULT '{}'::text[];
