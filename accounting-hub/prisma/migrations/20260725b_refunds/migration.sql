-- Patient refunds (deduction against Unearned Revenue, not an expense)
CREATE TABLE IF NOT EXISTS "Refund" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "patientId" TEXT,
  "patientName" TEXT NOT NULL,
  "refundAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "chargesDeducted" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "reason" TEXT,
  "proofUrls" JSONB,
  "audited" BOOLEAN NOT NULL DEFAULT false,
  "refundRfpId" TEXT,
  "paidAt" TIMESTAMP(3),
  "paymentMethod" TEXT,
  "checkNumber" TEXT,
  "paymentBankAccount" TEXT,
  "journalEntryId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Refund_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Refund_branch_idx" ON "Refund"("branch");
CREATE INDEX IF NOT EXISTS "Refund_refundRfpId_idx" ON "Refund"("refundRfpId");
CREATE INDEX IF NOT EXISTS "Refund_audited_idx" ON "Refund"("audited");
