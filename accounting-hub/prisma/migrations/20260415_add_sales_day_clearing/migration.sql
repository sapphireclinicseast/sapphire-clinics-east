CREATE TABLE "SalesDayClearing" (
    "id" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "clearedById" TEXT NOT NULL,
    "clearedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "remarks" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SalesDayClearing_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SalesDayClearing_date_branch_key" ON "SalesDayClearing"("date", "branch");
CREATE INDEX "SalesDayClearing_date_idx" ON "SalesDayClearing"("date");
CREATE INDEX "SalesDayClearing_branch_idx" ON "SalesDayClearing"("branch");
