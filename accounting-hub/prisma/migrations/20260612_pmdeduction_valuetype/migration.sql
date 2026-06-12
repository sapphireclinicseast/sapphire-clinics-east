-- Payment-mode deductions can now be a fixed peso amount, not only a percentage.
-- rate is interpreted by valueType: PERCENTAGE → % of gross; FIXED → peso amount.
ALTER TABLE "PaymentModeDeduction" ADD COLUMN IF NOT EXISTS "valueType" TEXT NOT NULL DEFAULT 'PERCENTAGE';
