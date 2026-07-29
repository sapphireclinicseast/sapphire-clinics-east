-- Cross-currency fund transfers.
--
-- Buying foreign currency (CNY bought through forex out of an AUB PHP account and
-- deposited into the AUB CNY account) moves one amount out of the source account
-- and a different amount into the destination. FundTransfer could only carry a
-- single `amount`, so the pair could not be represented at all.
--
-- `amount` keeps its meaning — what left the source account — and `toAmount` is
-- what landed in the destination. The implied rate is amount / toAmount, stored
-- alongside so the rate that actually applied on the day is not recomputed later
-- from figures that may since have been edited.
--
-- Both columns stay NULL for ordinary same-currency transfers, so existing rows
-- and the existing UI are unaffected.
ALTER TABLE "FundTransfer" ADD COLUMN IF NOT EXISTS "toAmount" DECIMAL(65,30);
ALTER TABLE "FundTransfer" ADD COLUMN IF NOT EXISTS "exchangeRate" DECIMAL(65,30);
