CREATE TABLE IF NOT EXISTS "CancelledCheck" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "checkNumber" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "reason" TEXT,
  "payee" TEXT,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CancelledCheck_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CancelledCheck_accountId_idx" ON "CancelledCheck"("accountId");
