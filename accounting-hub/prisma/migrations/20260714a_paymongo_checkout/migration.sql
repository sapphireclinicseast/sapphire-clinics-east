-- PayMongo checkout/payment tracking (Phase 1).
CREATE TABLE IF NOT EXISTS "PaymongoCheckout" (
  "id"            TEXT NOT NULL,
  "checkoutId"    TEXT NOT NULL,
  "referenceCode" TEXT,
  "orderId"       TEXT,
  "branch"        TEXT,
  "description"   TEXT,
  "amount"        DECIMAL(65,30) NOT NULL,
  "status"        TEXT NOT NULL DEFAULT 'PENDING',
  "checkoutUrl"   TEXT,
  "paymentId"     TEXT,
  "fee"           DECIMAL(65,30),
  "netAmount"     DECIMAL(65,30),
  "paidAt"        TIMESTAMP(3),
  "payoutId"      TEXT,
  "livemode"      BOOLEAN NOT NULL DEFAULT false,
  "raw"           JSONB,
  "createdById"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymongoCheckout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymongoCheckout_checkoutId_key" ON "PaymongoCheckout"("checkoutId");
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_status_idx" ON "PaymongoCheckout"("status");
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_orderId_idx" ON "PaymongoCheckout"("orderId");
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_payoutId_idx" ON "PaymongoCheckout"("payoutId");
