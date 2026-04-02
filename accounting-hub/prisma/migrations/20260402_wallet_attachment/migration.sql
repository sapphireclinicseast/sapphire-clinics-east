-- Add attachmentUrl to DigitalWallet (for GL proof of guarantee letter)
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "attachmentUrl" TEXT;
