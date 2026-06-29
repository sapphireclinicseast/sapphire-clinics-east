CREATE TABLE IF NOT EXISTS "ExpenseSupplier" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "registeredName" TEXT NOT NULL,
  "registeredAddress" TEXT,
  "tin" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ExpenseSupplier_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ExpenseSupplier_branch_registeredName_key" ON "ExpenseSupplier"("branch","registeredName");
CREATE INDEX IF NOT EXISTS "ExpenseSupplier_branch_idx" ON "ExpenseSupplier"("branch");
