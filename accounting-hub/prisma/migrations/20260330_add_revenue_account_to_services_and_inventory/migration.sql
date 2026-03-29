-- Add revenue account (Chart of Accounts) link to Service and InventoryItem
ALTER TABLE "Service" ADD COLUMN "revenueAccountId" TEXT;
ALTER TABLE "InventoryItem" ADD COLUMN "revenueAccountId" TEXT;

-- Foreign keys
ALTER TABLE "Service" ADD CONSTRAINT "Service_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "InventoryItem" ADD CONSTRAINT "InventoryItem_revenueAccountId_fkey"
  FOREIGN KEY ("revenueAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Indexes
CREATE INDEX "Service_revenueAccountId_idx" ON "Service"("revenueAccountId");
CREATE INDEX "InventoryItem_revenueAccountId_idx" ON "InventoryItem"("revenueAccountId");
