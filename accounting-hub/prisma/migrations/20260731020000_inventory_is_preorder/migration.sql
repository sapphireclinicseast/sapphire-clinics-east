-- Pre-order items are deliberately kept at 0 stock (e.g. swings). They stay sellable
-- at 0; the resulting negative quantity is the backlog, netted off against the lot
-- when the shipment's arrival is recorded as an INCREASE adjustment.
ALTER TABLE "InventoryItem" ADD COLUMN "isPreOrder" BOOLEAN NOT NULL DEFAULT false;
