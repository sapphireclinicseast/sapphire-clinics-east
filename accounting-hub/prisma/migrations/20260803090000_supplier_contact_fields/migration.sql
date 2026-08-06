-- Contact person and the channel they are reached on. Foreign suppliers are
-- usually contacted on a messaging app rather than the listed phone number.
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactPerson" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactMethod" TEXT;
ALTER TABLE "Supplier" ADD COLUMN IF NOT EXISTS "contactHandle" TEXT;

-- Supplier and product names are keyed inconsistently (some ALL CAPS, some not).
-- The hub standardises on upper case; the Verdana storefront title-cases for display.
UPDATE "Supplier" SET "supplierName" = upper("supplierName") WHERE "supplierName" <> upper("supplierName");
UPDATE "InventoryItem" SET name = upper(name) WHERE name <> upper(name);
