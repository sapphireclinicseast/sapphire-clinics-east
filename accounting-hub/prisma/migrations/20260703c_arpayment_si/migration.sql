-- Sales Invoice number issued for an HMO/GL collection
ALTER TABLE "ARPayment" ADD COLUMN IF NOT EXISTS "salesInvoiceNumber" TEXT;
