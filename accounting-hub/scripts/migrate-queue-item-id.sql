-- Add queueItemId column to Order table for tracking converted queue appointments
DO $$ BEGIN
  ALTER TABLE "Order" ADD COLUMN "queueItemId" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "Order_queueItemId_idx" ON "Order"("queueItemId");
