-- Add totalGlAmount field to DigitalWallet for GL wallets
-- This tracks the full approved GL amount (for Accounts Receivable)
-- separately from the balance (remaining usable amount)
ALTER TABLE "DigitalWallet" ADD COLUMN "totalGlAmount" DECIMAL;

-- Backfill: set totalGlAmount to current balance for existing GL wallets
UPDATE "DigitalWallet" SET "totalGlAmount" = "balance" WHERE "walletType" = 'GL' AND "balance" > 0;
