-- Add deductionType to CutoffAdjustment
-- TAXABLE = pre-tax deduction (reduces taxable income for withholding tax)
-- NON_TAXABLE = post-tax deduction (reduces net pay only, default behavior)
ALTER TABLE "CutoffAdjustment" ADD COLUMN IF NOT EXISTS "deductionType" TEXT NOT NULL DEFAULT 'NON_TAXABLE';
