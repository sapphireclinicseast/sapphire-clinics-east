-- Add AR_PAYMENT to WalletAction enum
ALTER TYPE "WalletAction" ADD VALUE IF NOT EXISTS 'AR_PAYMENT';

-- Remove unique constraint on (patientId, walletType) to allow re-creation after deletion
DROP INDEX IF EXISTS "DigitalWallet_patientId_walletType_key";
CREATE INDEX "DigitalWallet_patientId_walletType_idx" ON "DigitalWallet"("patientId", "walletType");

-- Add COA account to DigitalWallet (for HMO/GL → Accounts Receivable classification)
ALTER TABLE "DigitalWallet" ADD COLUMN "accountId" TEXT;
ALTER TABLE "DigitalWallet" ADD CONSTRAINT "DigitalWallet_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "DigitalWallet_accountId_idx" ON "DigitalWallet"("accountId");

-- Accounts Receivable Payment tracking
CREATE TABLE "ARPayment" (
  "id" TEXT NOT NULL,
  "walletId" TEXT NOT NULL,
  "paymentDate" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "discount" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "discountAccountId" TEXT,
  "proofUrl" TEXT,
  "notes" TEXT,
  "branch" TEXT,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ARPayment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ARPaymentItem" (
  "id" TEXT NOT NULL,
  "paymentId" TEXT NOT NULL,
  "orderId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ARPaymentItem_pkey" PRIMARY KEY ("id")
);

-- Foreign keys
ALTER TABLE "ARPayment" ADD CONSTRAINT "ARPayment_walletId_fkey"
  FOREIGN KEY ("walletId") REFERENCES "DigitalWallet"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ARPayment" ADD CONSTRAINT "ARPayment_discountAccountId_fkey"
  FOREIGN KEY ("discountAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ARPayment" ADD CONSTRAINT "ARPayment_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "ARPaymentItem" ADD CONSTRAINT "ARPaymentItem_paymentId_fkey"
  FOREIGN KEY ("paymentId") REFERENCES "ARPayment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ARPaymentItem" ADD CONSTRAINT "ARPaymentItem_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "ARPayment_walletId_idx" ON "ARPayment"("walletId");
CREATE INDEX "ARPayment_paymentDate_idx" ON "ARPayment"("paymentDate");
CREATE INDEX "ARPayment_branch_idx" ON "ARPayment"("branch");
CREATE INDEX "ARPayment_createdById_idx" ON "ARPayment"("createdById");
CREATE INDEX "ARPaymentItem_paymentId_idx" ON "ARPaymentItem"("paymentId");
CREATE INDEX "ARPaymentItem_orderId_idx" ON "ARPaymentItem"("orderId");
