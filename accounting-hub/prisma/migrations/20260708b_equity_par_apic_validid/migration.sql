-- Split share issue price into True Par + APIC (both per-share), add valid-ID uploads.
-- Backfill: existing pricePerShare becomes truePar, apic = 0 (price unchanged).
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "truePar" DECIMAL(65,30);
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "apic" DECIMAL(65,30);
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "validIdUrls" JSONB;
UPDATE "CommonShare" SET "truePar" = "pricePerShare", "apic" = 0 WHERE "truePar" IS NULL;

ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "truePar" DECIMAL(65,30);
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "apic" DECIMAL(65,30);
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "validIdUrls" JSONB;
UPDATE "PreferredShare" SET "truePar" = "pricePerShare", "apic" = 0 WHERE "truePar" IS NULL;
