-- Itemized register for 4010 Accounts Payable.
CREATE TABLE IF NOT EXISTS "APItem" (
  "id" TEXT NOT NULL,
  "vendor" TEXT NOT NULL,
  "description" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "dateIncurred" TIMESTAMP(3) NOT NULL,
  "branch" TEXT NOT NULL DEFAULT 'ALL',
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "closedAt" TIMESTAMP(3),
  "closeAccountId" TEXT,
  "closeNote" TEXT,
  "closeJournalEntryId" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "APItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "APItem_status_idx" ON "APItem"("status");
