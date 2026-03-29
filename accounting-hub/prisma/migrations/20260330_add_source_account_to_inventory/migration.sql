-- Add source account (where money comes from) to InventoryItem
ALTER TABLE "InventoryItem" ADD COLUMN "sourceAccountId" TEXT;

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_sourceAccountId_fkey"
  FOREIGN KEY ("sourceAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "InventoryItem_sourceAccountId_idx" ON "InventoryItem"("sourceAccountId");
