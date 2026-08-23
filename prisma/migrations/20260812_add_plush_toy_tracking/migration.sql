-- Aura the Alpaca plush-toy perk tracking (VIP wallet holders / 100-session
-- milestone patients get one piece each, marked once given by front desk).
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "plushToyGivenAt" TIMESTAMP(3);
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "plushToyGivenBy" TEXT;
