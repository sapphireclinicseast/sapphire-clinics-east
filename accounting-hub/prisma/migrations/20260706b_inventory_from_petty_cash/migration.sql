-- Inventory bought via petty cash / expense: cash handled by replenishment, not an inventory cash outflow.
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "fromPettyCash" BOOLEAN NOT NULL DEFAULT false;
