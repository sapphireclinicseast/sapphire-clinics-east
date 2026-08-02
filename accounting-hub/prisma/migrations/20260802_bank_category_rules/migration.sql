-- Auto-categorization rules for bank reconciliation.
CREATE TABLE IF NOT EXISTS "BankCategoryRule" (
  "id" TEXT NOT NULL,
  "pattern" TEXT NOT NULL,
  "direction" TEXT NOT NULL DEFAULT 'ANY',
  "bankAccountId" TEXT,
  "categoryAccountId" TEXT NOT NULL,
  "fromToName" TEXT,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BankCategoryRule_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BankCategoryRule_active_idx" ON "BankCategoryRule"("active");
