-- Add pdfUrl to EmployeePayslip and PayrollEntry for stored PDF files
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "pdfUrl" TEXT;
