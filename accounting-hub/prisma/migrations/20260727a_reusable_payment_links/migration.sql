-- Reusable payment links. PayMongo checkout sessions are single-use and, for QRPh, never
-- collect the payer's details — so the intake is hosted at /pay/<token>: the payer enters
-- their name/contact/email there and a fresh checkout session is minted per patient.
CREATE TABLE IF NOT EXISTS "PaymentLink" (
  "id" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "account" TEXT NOT NULL,
  "branch" TEXT,
  "serviceId" TEXT,
  "inventoryItemId" TEXT,
  "itemName" TEXT NOT NULL,
  "department" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "allowVoucher" BOOLEAN NOT NULL DEFAULT true,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "PaymentLink_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymentLink_token_key" ON "PaymentLink"("token");
CREATE INDEX IF NOT EXISTS "PaymentLink_account_idx" ON "PaymentLink"("account");
CREATE INDEX IF NOT EXISTS "PaymentLink_token_idx" ON "PaymentLink"("token");
CREATE INDEX IF NOT EXISTS "PaymentLink_isActive_idx" ON "PaymentLink"("isActive");

ALTER TABLE "PaymongoCheckout" ADD COLUMN IF NOT EXISTS "paymentLinkId" TEXT;
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_paymentLinkId_idx" ON "PaymongoCheckout"("paymentLinkId");
