-- "Returned by Buyer" flag for product orders. When set, stock is restocked (via an
-- INCREASE inventory adjustment referencing the order) and the sale is reversed (VOIDED).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "returnedByBuyer" BOOLEAN NOT NULL DEFAULT false;
