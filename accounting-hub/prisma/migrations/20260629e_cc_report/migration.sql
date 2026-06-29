ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "creditCardId" TEXT;
CREATE TABLE IF NOT EXISTS "CreditCardReport" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "cardId" TEXT NOT NULL,
  "bankCode" TEXT NOT NULL,
  "refSeq" INTEGER NOT NULL,
  "refNumber" TEXT NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "statementUrl" TEXT,
  "status" TEXT NOT NULL DEFAULT 'FOR_FILING',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditCardReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CreditCardReport_branch_idx" ON "CreditCardReport"("branch");
CREATE UNIQUE INDEX IF NOT EXISTS "CreditCardReport_branch_cardId_periodMonth_periodYear_key" ON "CreditCardReport"("branch","cardId","periodMonth","periodYear");
