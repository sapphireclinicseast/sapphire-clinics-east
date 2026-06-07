-- Add totalGlAmount field to DigitalWallet for GL wallets
-- This tracks the full approved GL amount (for Accounts Receivable)
-- separately from the balance (remaining usable amount)
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "totalGlAmount" DECIMAL;

-- Backfill ONLY wallets that have never had an Approved SOA recorded (totalGlAmount IS NULL).
--
-- CRITICAL SAFEGUARD: the deploy pipeline REPLAYS every migration.sql on every deploy.
-- The original statement here was unconditional:
--     UPDATE "DigitalWallet" SET "totalGlAmount" = "balance" WHERE "walletType" = 'GL' AND "balance" > 0;
-- so on EVERY deploy it reset the Approved SOA back to the (already-decremented) remaining
-- balance for every active GL wallet — silently wiping manual corrections and the ledger
-- recompute, and making the Approved SOA "reset to = balance" each time. The "totalGlAmount
-- IS NULL" guard makes this a true one-time backfill: once a wallet has an Approved SOA it is
-- never overwritten by a replay again. New GL wallets set totalGlAmount explicitly at
-- creation, so this never touches them.
UPDATE "DigitalWallet" SET "totalGlAmount" = "balance"
  WHERE "walletType" = 'GL' AND "balance" > 0 AND "totalGlAmount" IS NULL;
