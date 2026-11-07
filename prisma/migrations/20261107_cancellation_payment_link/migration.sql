-- Explicit link from a cancellation to the POS order line that settled its fee.
--
-- Until now "paid" was inferred by matching order-line NAMES and dates, which
-- could only ever say that a fee had been collected for somebody — not which
-- cancellation it settled. The Accounting Hub now writes the link at the till.
--
-- Guarded with IF NOT EXISTS throughout: this deploy replays every migration on
-- every run with no tracker, so each one has to be safe to re-apply.

ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "paidOrderId"     TEXT;
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "paidOrderNumber" INTEGER;
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "paidLineName"    TEXT;
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "paidAmount"      DOUBLE PRECISION;
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "paidByName"      TEXT;

CREATE INDEX IF NOT EXISTS "CancellationLog_paidOrderId_idx" ON "CancellationLog"("paidOrderId");
