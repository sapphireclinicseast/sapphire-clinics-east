-- Add variant tracking to OrderItem
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "variantId" TEXT;
ALTER TABLE "OrderItem" ADD COLUMN IF NOT EXISTS "variantLabel" TEXT;
