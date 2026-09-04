-- Service payment type: CASH | HMO | GL — finer-grained than isHmoGl (which
-- stays true for both HMO and GL). Backfill: '- OP' names are GL, the rest of
-- the isHmoGl-tagged services are HMO, everything else stays CASH.
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "paymentType" TEXT NOT NULL DEFAULT 'CASH';
UPDATE "Service" SET "paymentType" = 'GL'  WHERE "isHmoGl" = true AND name ILIKE '%- OP%' AND "paymentType" = 'CASH';
UPDATE "Service" SET "paymentType" = 'HMO' WHERE "isHmoGl" = true AND "paymentType" = 'CASH';
