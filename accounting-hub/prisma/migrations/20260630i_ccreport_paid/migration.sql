-- Credit-card bill settlement (must be paid before its expenses hit the Expense Report).
ALTER TABLE "CreditCardReport" ADD COLUMN IF NOT EXISTS "paidAt" TIMESTAMP(3);
ALTER TABLE "CreditCardReport" ADD COLUMN IF NOT EXISTS "paymentForm" TEXT;
ALTER TABLE "CreditCardReport" ADD COLUMN IF NOT EXISTS "paymentRef" TEXT;
