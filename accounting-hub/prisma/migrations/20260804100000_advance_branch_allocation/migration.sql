-- Which branch(es) an advance funds, so its interest expense reaches those branches'
-- income statements. Mirrors Loan.branchAllocations. NULL = company-wide, which is how
-- every existing advance behaves today.
ALTER TABLE "Advance" ADD COLUMN "branchAllocations" JSONB;
