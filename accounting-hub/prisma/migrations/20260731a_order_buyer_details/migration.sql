-- Who the sale was to. Asked on every checkout, since an official sales invoice
-- needs the buyer whatever the payment mode was. A patient is matched from the
-- CRM; anyone else is typed in. Only an invoice needs an address or a TIN, so
-- these stay null on an ordinary walk-in sale.
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerIsPatient" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerAddress" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerIsBusiness" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerBusinessName" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "buyerTin" TEXT;
ALTER TABLE "OtherReceivable" ADD COLUMN IF NOT EXISTS "buyerAddress" TEXT;
