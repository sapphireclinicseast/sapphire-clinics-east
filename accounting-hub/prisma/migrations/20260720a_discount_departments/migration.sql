-- Restrict a discount to specific departments (empty = all). Idempotent.
ALTER TABLE "DiscountSetting" ADD COLUMN IF NOT EXISTS "departments" TEXT[] NOT NULL DEFAULT '{}'::text[];
