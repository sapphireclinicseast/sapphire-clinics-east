-- Sales day clearing: support draft-save (counted cash) separate from official clearing.
-- isCleared: true = officially cleared; false = draft-saved only. Existing rows predate the
--   draft feature and every one of them WAS an official clearing, so default existing rows to
--   true. New rows always set this explicitly from the app (POST=true, PUT draft=false), so the
--   column default only affects this one-time backfill — safe to re-run (ADD COLUMN IF NOT EXISTS).
-- actualAmounts: [{ method: string, amount: number }] — counted cash per payment method.
ALTER TABLE "SalesDayClearing" ADD COLUMN IF NOT EXISTS "isCleared" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "SalesDayClearing" ADD COLUMN IF NOT EXISTS "actualAmounts" JSONB;
