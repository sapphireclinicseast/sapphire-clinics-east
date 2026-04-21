-- Add make-up session tracking to CancellationLog
ALTER TABLE "CancellationLog" ADD COLUMN "madeUp" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CancellationLog" ADD COLUMN "madeUpAt" TIMESTAMP(3);
