-- Record which variant a stock movement applies to, so arrivals and shrinkage can be
-- booked against a specific colour/size instead of the product as a whole.
-- NULL keeps the existing meaning: the movement applies to the product overall.
ALTER TABLE "InventoryAdjustment" ADD COLUMN "variantId" TEXT;
ALTER TABLE "InventoryAdjustment"
  ADD CONSTRAINT "InventoryAdjustment_variantId_fkey"
  FOREIGN KEY ("variantId") REFERENCES "InventoryVariant"("id") ON DELETE SET NULL ON UPDATE CASCADE;
CREATE INDEX "InventoryAdjustment_variantId_idx" ON "InventoryAdjustment"("variantId");
