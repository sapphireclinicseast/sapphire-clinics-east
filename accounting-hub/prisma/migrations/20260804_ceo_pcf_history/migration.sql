CREATE TABLE IF NOT EXISTS "CeoPcfHistory" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "particulars" TEXT NOT NULL,
  "receivedBy" TEXT,
  "cashIn" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "cashOut" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "fileName" TEXT,
  "remarks" TEXT,
  "qbRecorded" BOOLEAN NOT NULL DEFAULT false,
  "qbRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CeoPcfHistory_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CeoPcfHistory_branch_date_idx" ON "CeoPcfHistory"("branch","date");
