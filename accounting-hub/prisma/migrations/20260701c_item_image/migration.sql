-- Product photo for inventory items.
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "imageUrl" TEXT;
