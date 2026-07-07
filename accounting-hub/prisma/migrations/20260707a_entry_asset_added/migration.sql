-- Persistent flag: when a petty-cash/expense entry was added to Asset Management.
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "assetAddedAt" TIMESTAMP(3);
