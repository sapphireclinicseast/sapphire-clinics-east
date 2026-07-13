-- Service flagged as HMO/Guarantee Letter (sales are receivables).
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "isHmoGl" BOOLEAN NOT NULL DEFAULT false;
