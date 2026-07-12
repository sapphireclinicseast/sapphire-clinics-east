-- One-time RFP copy of a distributed recurring entry: kept out of the Income Statement.
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "skipReports" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "sourceRecurringId" TEXT;
