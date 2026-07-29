-- State foreign-currency accounts in PHP for reporting.
--
-- The Chart of Accounts already told users that "financial reports will
-- auto-convert to PHP using the exchange rate at time of transaction", but
-- nothing implemented it: a CNY bank line posted its yuan figure straight into
-- the general ledger, where every report reads it as pesos.
--
-- Rates are held per currency and effective date. They are captured from real
-- transactions — matching a currency exchange in Bank Reconciliation records the
-- rate it implied — and may also be entered by hand for dates with no exchange.
CREATE TABLE IF NOT EXISTS "ExchangeRate" (
    "id" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "phpPerUnit" DECIMAL(65,30) NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExchangeRate_currency_date_key" ON "ExchangeRate"("currency", "date");
CREATE INDEX IF NOT EXISTS "ExchangeRate_currency_date_idx" ON "ExchangeRate"("currency", "date");

-- The rate actually applied to a posted line, so a ledger figure stays traceable
-- to its rate even if the table is corrected later.
ALTER TABLE "BankTransaction" ADD COLUMN IF NOT EXISTS "fxRate" DECIMAL(65,30);
