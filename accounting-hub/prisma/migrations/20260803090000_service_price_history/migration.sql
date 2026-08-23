-- Price history for services. The audit log only ever recorded which fields changed,
-- never their values, so history starts from the BASELINE rows seeded below.
CREATE TABLE "ServicePriceHistory" (
  "id"          TEXT NOT NULL,
  "serviceId"   TEXT NOT NULL,
  "branch"      TEXT,
  "field"       TEXT NOT NULL,
  "oldValue"    DECIMAL(12,2),
  "newValue"    DECIMAL(12,2),
  "source"      TEXT NOT NULL DEFAULT 'EDIT',
  "note"        TEXT,
  "changedById" TEXT,
  "changedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServicePriceHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ServicePriceHistory_serviceId_changedAt_idx" ON "ServicePriceHistory"("serviceId","changedAt");
ALTER TABLE "ServicePriceHistory" ADD CONSTRAINT "ServicePriceHistory_serviceId_fkey"
  FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ServicePriceHistory" ADD CONSTRAINT "ServicePriceHistory_changedById_fkey"
  FOREIGN KEY ("changedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Baseline: today's price for every active service, so a history view is never empty
-- and every later change has something to be measured against.
INSERT INTO "ServicePriceHistory" ("id","serviceId","field","oldValue","newValue","source","note","changedAt")
SELECT gen_random_uuid()::text, s.id, 'price', NULL, s.price, 'BASELINE',
       'Starting point — price history was introduced on 2026-08-03', s."createdAt"
FROM "Service" s;
