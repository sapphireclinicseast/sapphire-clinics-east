-- Other Receivables: credit/bulk sales to outside customers (e.g. Sandbox
-- Clark). Created by POS product orders paid via "Receivable"; collected under
-- Accounts Receivable → Others, optionally on a staggered monthly plan.
CREATE TABLE "OtherReceivable" (
    "id" TEXT NOT NULL,
    "branch" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "orderId" TEXT,
    "principal" DECIMAL(65,30) NOT NULL,
    "months" INTEGER,
    "interestType" TEXT,
    "interestValue" DECIMAL(65,30),
    "totalDue" DECIMAL(65,30) NOT NULL,
    "monthlyAmount" DECIMAL(65,30),
    "startDate" TIMESTAMP(3),
    "notes" TEXT,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OtherReceivable_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "OtherReceivablePayment" (
    "id" TEXT NOT NULL,
    "receivableId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL,
    "method" TEXT,
    "reference" TEXT,
    "proofUrl" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OtherReceivablePayment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OtherReceivable_orderId_key" ON "OtherReceivable"("orderId");
CREATE INDEX "OtherReceivable_branch_idx" ON "OtherReceivable"("branch");
CREATE INDEX "OtherReceivable_status_idx" ON "OtherReceivable"("status");
CREATE INDEX "OtherReceivable_customerName_idx" ON "OtherReceivable"("customerName");
CREATE INDEX "OtherReceivablePayment_receivableId_idx" ON "OtherReceivablePayment"("receivableId");
CREATE INDEX "OtherReceivablePayment_date_idx" ON "OtherReceivablePayment"("date");

ALTER TABLE "OtherReceivable" ADD CONSTRAINT "OtherReceivable_orderId_fkey"
  FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "OtherReceivablePayment" ADD CONSTRAINT "OtherReceivablePayment_receivableId_fkey"
  FOREIGN KEY ("receivableId") REFERENCES "OtherReceivable"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- A sale to a company is billed to the company rather than to whoever collected
-- it, and an official sales invoice carries the buyer's TIN. Walk-in customers
-- have neither, so these stay null.
ALTER TABLE "OtherReceivable" ADD COLUMN IF NOT EXISTS "isBusiness" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "OtherReceivable" ADD COLUMN IF NOT EXISTS "businessName" TEXT;
ALTER TABLE "OtherReceivable" ADD COLUMN IF NOT EXISTS "businessTin" TEXT;
ALTER TABLE "OtherReceivable" ADD COLUMN IF NOT EXISTS "issuedSalesInvoice" BOOLEAN NOT NULL DEFAULT false;
