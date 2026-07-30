-- Freight-batch FX source + linked payment RFPs.
-- fxSourceAccountId: the foreign-currency (e.g. CNY) bank account the payment was
-- drawn from — the exchange rate suggestion is that account's weighted forex
-- purchase rate. manufacturerRfpId / freightRfpId: the Expense RFPs that paid the
-- manufacturer and the freight forwarder for this shipment.
ALTER TABLE "InventoryAdjustmentBatch" ADD COLUMN "fxSourceAccountId" TEXT;
ALTER TABLE "InventoryAdjustmentBatch" ADD COLUMN "manufacturerRfpId" TEXT;
ALTER TABLE "InventoryAdjustmentBatch" ADD COLUMN "freightRfpId" TEXT;

CREATE INDEX "InventoryAdjustmentBatch_fxSourceAccountId_idx" ON "InventoryAdjustmentBatch"("fxSourceAccountId");
CREATE INDEX "InventoryAdjustmentBatch_manufacturerRfpId_idx" ON "InventoryAdjustmentBatch"("manufacturerRfpId");
CREATE INDEX "InventoryAdjustmentBatch_freightRfpId_idx" ON "InventoryAdjustmentBatch"("freightRfpId");

ALTER TABLE "InventoryAdjustmentBatch" ADD CONSTRAINT "InventoryAdjustmentBatch_fxSourceAccountId_fkey"
  FOREIGN KEY ("fxSourceAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustmentBatch" ADD CONSTRAINT "InventoryAdjustmentBatch_manufacturerRfpId_fkey"
  FOREIGN KEY ("manufacturerRfpId") REFERENCES "ReimbursementReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "InventoryAdjustmentBatch" ADD CONSTRAINT "InventoryAdjustmentBatch_freightRfpId_fkey"
  FOREIGN KEY ("freightRfpId") REFERENCES "ReimbursementReport"("id") ON DELETE SET NULL ON UPDATE CASCADE;
