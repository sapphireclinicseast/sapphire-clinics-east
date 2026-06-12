-- Sales channel ("Platform") for product POS orders: Website | Shopee | Lazada | Tiktok | Clinic.
-- Nullable; existing orders stay NULL (reported as "Unspecified" in Products Analysis).
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "platform" TEXT;
