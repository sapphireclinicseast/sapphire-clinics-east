-- GL wallets: patient diagnosis snapshot from CRM
ALTER TABLE "DigitalWallet"
  ADD COLUMN IF NOT EXISTS "diagnosis" TEXT;
