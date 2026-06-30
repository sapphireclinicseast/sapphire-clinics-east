-- Tax RFPs store their line items (payroll/expense references) in meta JSON.
ALTER TABLE "ReimbursementReport" ADD COLUMN IF NOT EXISTS "meta" JSONB;
