-- Informational-only record of a TikTok order that never became a sale
-- (cancelled or failed-delivery), with TikTok's own cancel reason, for the
-- Products Analysis "Top Cancellation Reasons" breakdown. No GL/order linkage —
-- the orders importer never touches these (Order Status != Completed).
CREATE TABLE "TiktokCancellation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT 'VERDANA_STORE',
    "status" TEXT NOT NULL,
    "cancelType" TEXT,
    "cancelBy" TEXT,
    "cancelReason" TEXT,
    "orderAmount" DECIMAL(65,30),
    "cancelledTime" TIMESTAMP(3),
    "sourceFile" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TiktokCancellation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TiktokCancellation_orderId_key" ON "TiktokCancellation"("orderId");
CREATE INDEX "TiktokCancellation_branch_idx" ON "TiktokCancellation"("branch");
CREATE INDEX "TiktokCancellation_cancelReason_idx" ON "TiktokCancellation"("cancelReason");
