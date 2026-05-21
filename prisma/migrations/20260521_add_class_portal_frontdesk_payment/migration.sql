-- ClassPortal: pending front-desk cash payment notifications.
-- Surfaced to the accounting hub's POS Cashier via /api/queue/external.
CREATE TABLE IF NOT EXISTS "ClassPortalFrontDeskPayment" (
    "id" TEXT NOT NULL,
    "classPortalPaymentId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "studentName" TEXT NOT NULL,
    "branch" "ClassPortalBranch" NOT NULL,
    "plan" TEXT NOT NULL,
    "tuitionCentavos" INTEGER NOT NULL,
    "miscCentavos" INTEGER NOT NULL DEFAULT 0,
    "period" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "convertedAt" TIMESTAMP(3),
    CONSTRAINT "ClassPortalFrontDeskPayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalFrontDeskPayment_classPortalPaymentId_key"
    ON "ClassPortalFrontDeskPayment"("classPortalPaymentId");
CREATE INDEX IF NOT EXISTS "ClassPortalFrontDeskPayment_branch_status_idx"
    ON "ClassPortalFrontDeskPayment"("branch", "status");
CREATE INDEX IF NOT EXISTS "ClassPortalFrontDeskPayment_createdAt_idx"
    ON "ClassPortalFrontDeskPayment"("createdAt");
