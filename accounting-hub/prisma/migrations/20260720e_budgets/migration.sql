CREATE TABLE IF NOT EXISTS "BudgetEntry" (
  "id" TEXT NOT NULL, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL,
  "branch" TEXT NOT NULL, "accountKey" TEXT NOT NULL, "accountType" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL DEFAULT 0, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetEntry_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetEntry_year_month_branch_accountKey_key" ON "BudgetEntry"("year","month","branch","accountKey");
CREATE INDEX IF NOT EXISTS "BudgetEntry_year_branch_idx" ON "BudgetEntry"("year","branch");
CREATE TABLE IF NOT EXISTS "BudgetLock" (
  "id" TEXT NOT NULL, "year" INTEGER NOT NULL, "month" INTEGER NOT NULL, "branch" TEXT NOT NULL,
  "lockedById" TEXT, "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BudgetLock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BudgetLock_year_month_branch_key" ON "BudgetLock"("year","month","branch");
