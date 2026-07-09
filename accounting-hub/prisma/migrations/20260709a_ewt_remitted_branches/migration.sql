-- CEO shared petty-cash entries: track EWT remittance per allocated branch.
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "ewtRemittedBranches" JSONB;
