-- Per-variant cost of sales and selling price. NULL means "inherit the parent item",
-- which is how every existing variant behaves today, so this is a no-op for current data.
ALTER TABLE "InventoryVariant" ADD COLUMN "unitCost" DECIMAL(12,2);
ALTER TABLE "InventoryVariant" ADD COLUMN "sellingPrice" DECIMAL(12,2);
