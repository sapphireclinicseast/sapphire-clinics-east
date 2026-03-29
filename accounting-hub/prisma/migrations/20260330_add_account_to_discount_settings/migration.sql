-- Add COA account link to DiscountSetting (contra-revenue accounts for discounts)
ALTER TABLE "DiscountSetting" ADD COLUMN "accountId" TEXT;

ALTER TABLE "DiscountSetting" ADD CONSTRAINT "DiscountSetting_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "DiscountSetting_accountId_idx" ON "DiscountSetting"("accountId");
