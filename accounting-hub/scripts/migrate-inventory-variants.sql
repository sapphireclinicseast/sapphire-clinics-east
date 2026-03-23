-- Add InventoryVariant table for color variants
CREATE TABLE IF NOT EXISTS "InventoryVariant" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "itemId" TEXT NOT NULL,
  "color" TEXT NOT NULL,
  "variantSku" TEXT NOT NULL,
  "barcode" TEXT,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryVariant_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryVariant_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryVariant_variantSku_key" ON "InventoryVariant"("variantSku");
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryVariant_barcode_key" ON "InventoryVariant"("barcode");
CREATE INDEX IF NOT EXISTS "InventoryVariant_itemId_idx" ON "InventoryVariant"("itemId");
CREATE INDEX IF NOT EXISTS "InventoryVariant_color_idx" ON "InventoryVariant"("color");
