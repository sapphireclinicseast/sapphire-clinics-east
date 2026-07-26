-- PayMongo multi-account support + promo vouchers.
-- Each branch has its own PayMongo merchant account (own secret key), so checkouts,
-- payments and payouts are tracked per account.

ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "account" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "serviceId" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "inventoryItemId" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "itemName" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "customerFirstName" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "customerLastName" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "customerPhone" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "customerEmail" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "voucherId" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "voucherCode" TEXT;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "grossAmount" DECIMAL(65,30);
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "discountAmount" DECIMAL(65,30);
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_account_idx" ON "PaymongoCheckout"("account");
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_voucherId_idx" ON "PaymongoCheckout"("voucherId");

-- Existing rows were all issued from the original (Verdana) account.
UPDATE "PaymongoCheckout" SET "account" = 'VERDANA' WHERE "account" IS NULL;

CREATE TABLE IF NOT EXISTS "Voucher" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "discountType" TEXT NOT NULL DEFAULT 'PERCENTAGE',
  "discountValue" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "isLifetime" BOOLEAN NOT NULL DEFAULT false,
  "startDate" TIMESTAMP(3),
  "endDate" TIMESTAMP(3),
  "branches" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "usageLimitType" TEXT NOT NULL DEFAULT 'UNLIMITED',
  "maxUses" INTEGER,
  "accountId" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Voucher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Voucher_code_key" ON "Voucher"("code");
CREATE INDEX IF NOT EXISTS "Voucher_code_idx" ON "Voucher"("code");
CREATE INDEX IF NOT EXISTS "Voucher_isActive_idx" ON "Voucher"("isActive");
DO $$ BEGIN
  ALTER TABLE "Voucher" ADD CONSTRAINT "Voucher_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "VoucherRedemption" (
  "id" TEXT NOT NULL,
  "voucherId" TEXT NOT NULL,
  "checkoutId" TEXT,
  "customerEmail" TEXT,
  "account" TEXT,
  "discountAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "redeemedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "VoucherRedemption_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "VoucherRedemption_voucherId_idx" ON "VoucherRedemption"("voucherId");
CREATE INDEX IF NOT EXISTS "VoucherRedemption_customerEmail_idx" ON "VoucherRedemption"("customerEmail");
CREATE INDEX IF NOT EXISTS "VoucherRedemption_checkoutId_idx" ON "VoucherRedemption"("checkoutId");
DO $$ BEGIN
  ALTER TABLE "VoucherRedemption" ADD CONSTRAINT "VoucherRedemption_voucherId_fkey"
    FOREIGN KEY ("voucherId") REFERENCES "Voucher"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "quantity" INTEGER NOT NULL DEFAULT 1;
