-- Assets created from petty cash / expense: cash handled by replenishment, no bank credit here.
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "fromPettyCash" BOOLEAN NOT NULL DEFAULT false;
