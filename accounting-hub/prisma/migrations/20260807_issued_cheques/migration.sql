-- The physical chequebook: one row per cheque leaf, including cancelled and
-- unused ones, so a chequebook that skips numbers can still be reconciled.
-- Re-run safe: the deploy replays every migration file on each deploy.
CREATE TABLE IF NOT EXISTS "IssuedCheque" (
  "id"          TEXT NOT NULL,
  "accountId"   TEXT NOT NULL,
  "checkNumber" TEXT NOT NULL,
  "date"        TIMESTAMP(3),
  "payee"       TEXT,
  "amount"      DECIMAL(65,30) NOT NULL DEFAULT 0,
  "status"      TEXT NOT NULL DEFAULT 'ISSUED',
  "note"        TEXT,
  "source"      TEXT,
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "IssuedCheque_pkey" PRIMARY KEY ("id")
);
DO $$ BEGIN
  ALTER TABLE "IssuedCheque" ADD CONSTRAINT "IssuedCheque_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- One row per cheque leaf per account.
CREATE UNIQUE INDEX IF NOT EXISTS "IssuedCheque_accountId_checkNumber_key" ON "IssuedCheque"("accountId", "checkNumber");
CREATE INDEX IF NOT EXISTS "IssuedCheque_accountId_idx" ON "IssuedCheque"("accountId");
CREATE INDEX IF NOT EXISTS "IssuedCheque_date_idx"      ON "IssuedCheque"("date");
CREATE INDEX IF NOT EXISTS "IssuedCheque_status_idx"    ON "IssuedCheque"("status");
