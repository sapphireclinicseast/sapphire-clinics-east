-- PayMongo payout auto-reconciliation settings (singleton).
-- Idempotent: this file is replayed on every deploy.
CREATE TABLE IF NOT EXISTS "PaymongoSettings" (
  "id"            TEXT NOT NULL DEFAULT 'singleton',
  "bankAccountId" TEXT,
  "autoReconcile" BOOLEAN NOT NULL DEFAULT true,
  "lastSyncAt"    TIMESTAMP(3),
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PaymongoSettings_pkey" PRIMARY KEY ("id")
);
