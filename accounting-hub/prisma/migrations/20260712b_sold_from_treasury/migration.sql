-- Flag: common shares reissued from treasury (bought-back) stock.
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "soldFromTreasury" BOOLEAN NOT NULL DEFAULT false;
