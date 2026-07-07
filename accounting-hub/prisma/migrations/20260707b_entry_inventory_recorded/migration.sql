-- Persistent flag: when a petty-cash/expense entry was recorded in Inventory & Procurement
-- (new item, stock adjustment, or capitalized freight). Cross-user "Recorded" state.
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "inventoryRecordedAt" TIMESTAMP(3);
