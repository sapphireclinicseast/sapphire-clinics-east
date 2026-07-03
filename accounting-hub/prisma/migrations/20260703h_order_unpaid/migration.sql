-- Unpaid orders: session recorded now, cash collected later on paymentDate
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PAID';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3);
