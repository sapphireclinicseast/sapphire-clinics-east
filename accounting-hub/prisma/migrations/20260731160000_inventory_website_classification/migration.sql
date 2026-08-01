-- Customer-facing website classification for verdanarehab.com. Kept separate from the
-- internal SKU department/category so merchandising can be re-grouped for shoppers
-- without renumbering SKUs. NULL = not yet classified.
ALTER TABLE "InventoryItem" ADD COLUMN "websiteClassification" TEXT;
