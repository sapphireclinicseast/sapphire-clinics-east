-- Consumable pre-numbered forms (e.g. ADMIN01) tracked by control-number range.
-- Received pcs = numeric(toControl) − numeric(fromControl) + 1. Per branch.
CREATE TABLE IF NOT EXISTS "FormReceipt" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "formType" TEXT NOT NULL,
    "dateReceived" TIMESTAMP(3) NOT NULL,
    "fromControl" TEXT NOT NULL,
    "toControl" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "remarks" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FormReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FormReceipt_branch_idx" ON "FormReceipt"("branch");
CREATE INDEX IF NOT EXISTS "FormReceipt_formType_idx" ON "FormReceipt"("formType");
