-- Separate "Leave" earnings line on employee payslips.
-- Leave was previously folded into basicPay; it now lives in its own column and
-- is added back into grossPay, so gross/net are unchanged (net-neutral split).
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "leavePay" DECIMAL(65,30) NOT NULL DEFAULT 0;
