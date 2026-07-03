-- Tag-to-order: SI number assigned to an existing order
ALTER TABLE "SalesInvoiceFlag" ADD COLUMN IF NOT EXISTS "orderId" TEXT;
