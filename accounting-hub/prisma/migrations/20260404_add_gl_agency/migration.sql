-- Add agency field to DigitalWallet for GL wallets
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "agency" TEXT;
