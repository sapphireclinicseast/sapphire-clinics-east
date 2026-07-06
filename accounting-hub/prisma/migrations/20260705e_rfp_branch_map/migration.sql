-- CEO branch RFPs: per-branch reimbursement map on petty-cash entries.
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "rfpBranchMap" JSONB;
