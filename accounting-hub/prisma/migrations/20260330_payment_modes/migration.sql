-- Payment Mode Settings
-- Adds PaymentMode and PaymentModeDeduction models, and extends DigitalWallet and OrderPayment

-- ── PaymentMode ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PaymentMode" (
  "id"        TEXT        NOT NULL,
  "name"      TEXT        NOT NULL,
  "isActive"  BOOLEAN     NOT NULL DEFAULT true,
  "accountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentMode_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentMode"
  ADD CONSTRAINT "PaymentMode_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PaymentMode_isActive_idx" ON "PaymentMode"("isActive");

-- Add paymentMethod column (added after initial migration)
ALTER TABLE "PaymentMode" ADD COLUMN IF NOT EXISTS "paymentMethod" TEXT;

-- ── PaymentModeDeduction ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "PaymentModeDeduction" (
  "id"            TEXT          NOT NULL,
  "paymentModeId" TEXT          NOT NULL,
  "name"          TEXT          NOT NULL,
  "rate"          DECIMAL(65,30) NOT NULL,
  "accountId"     TEXT,
  "createdAt"     TIMESTAMP(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymentModeDeduction_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PaymentModeDeduction"
  ADD CONSTRAINT "PaymentModeDeduction_paymentModeId_fkey"
  FOREIGN KEY ("paymentModeId") REFERENCES "PaymentMode"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PaymentModeDeduction"
  ADD CONSTRAINT "PaymentModeDeduction_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "PaymentModeDeduction_paymentModeId_idx" ON "PaymentModeDeduction"("paymentModeId");

-- ── DigitalWallet — add dateObtained and paymentModeId ───────────────────────
ALTER TABLE "DigitalWallet"
  ADD COLUMN IF NOT EXISTS "dateObtained"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "paymentModeId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'DigitalWallet_paymentModeId_fkey'
  ) THEN
    ALTER TABLE "DigitalWallet"
      ADD CONSTRAINT "DigitalWallet_paymentModeId_fkey"
      FOREIGN KEY ("paymentModeId") REFERENCES "PaymentMode"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "DigitalWallet_paymentModeId_idx" ON "DigitalWallet"("paymentModeId");

-- ── OrderPayment — add paymentModeId ─────────────────────────────────────────
ALTER TABLE "OrderPayment"
  ADD COLUMN IF NOT EXISTS "paymentModeId" TEXT;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'OrderPayment_paymentModeId_fkey'
  ) THEN
    ALTER TABLE "OrderPayment"
      ADD CONSTRAINT "OrderPayment_paymentModeId_fkey"
      FOREIGN KEY ("paymentModeId") REFERENCES "PaymentMode"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "OrderPayment_paymentModeId_idx" ON "OrderPayment"("paymentModeId");
