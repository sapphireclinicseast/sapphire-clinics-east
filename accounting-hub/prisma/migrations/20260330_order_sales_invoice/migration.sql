-- Add sales invoice fields to Order
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "issuedOfficialInvoice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "salesInvoiceNumber" TEXT;
