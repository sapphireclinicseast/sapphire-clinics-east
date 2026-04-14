-- Add issuedOfficialInvoice flag to Service and InventoryItem
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "issuedOfficialInvoice" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "issuedOfficialInvoice" BOOLEAN NOT NULL DEFAULT false;
