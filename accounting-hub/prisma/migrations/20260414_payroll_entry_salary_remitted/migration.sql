ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "salariesRemitted" BOOLEAN NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "PayrollEntry_salariesRemitted_idx" ON "PayrollEntry"("salariesRemitted");
