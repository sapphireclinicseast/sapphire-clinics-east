-- GL wallets: approved service types (PT, OT, SLP, SPED, Psychology, MD, Orthosis)
ALTER TABLE "DigitalWallet"
  ADD COLUMN IF NOT EXISTS "approvedServices" JSONB;
