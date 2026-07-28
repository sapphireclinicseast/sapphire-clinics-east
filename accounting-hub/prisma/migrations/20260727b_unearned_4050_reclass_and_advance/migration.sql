-- 1) Reclassify unearned-revenue traffic that was mis-posted to the refunds contra.
--
--    `post-order.ts` resolved the unearned account with `findFirst(4055) ?? findFirst(4050)`.
--    The left side is a Promise, never null, so the 4050 fallback was dead code — and once
--    migration 20260726a created "4055 Refunds of Unearned Revenue", every customer deposit
--    and every wallet draw-down started landing in the refunds contra instead of the
--    "4050 Unearned Revenue" liability. 4050 ended up with 485 credits and zero debits.
--
--    These lines were always meant to be 4050, so they are corrected in place rather than
--    round-tripped through a separate correcting entry: that keeps each order's own journal
--    entry right (and still balanced — only the account changes, never an amount) instead of
--    leaving every affected order pointing at the wrong account. Safe here because no closing
--    entry exists, so no period has been closed over them.
--
--    Scoped to the two descriptions the mis-posting produced, so a genuine refund of unearned
--    revenue booked to 4055 is never touched. Re-running finds nothing left to do.
UPDATE "JournalEntryLine" jl
SET "accountId" = (SELECT id FROM "Account" WHERE "accountNumber" = '4050')
WHERE jl."accountId" = (SELECT id FROM "Account" WHERE "accountNumber" = '4055')
  AND (jl.description LIKE 'Unearned deposit —%' OR jl.description LIKE 'Wallet draw-down —%')
  AND EXISTS (SELECT 1 FROM "Account" WHERE "accountNumber" = '4050');

-- 2) Teletherapy advances: which patient ADVANCE wallet a PayMongo payment was loaded into.
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "advanceWalletId" TEXT;

-- Verification (both should be zero / empty after this runs):
--   SELECT count(*) FROM "JournalEntryLine" jl JOIN "Account" a ON a.id = jl."accountId"
--   WHERE a."accountNumber" = '4055'
--     AND (jl.description LIKE 'Unearned deposit —%' OR jl.description LIKE 'Wallet draw-down —%');
