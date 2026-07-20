CREATE TABLE IF NOT EXISTS "SkuDefinition" (
  "id" TEXT NOT NULL,
  "skuCode" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "mainCategory" TEXT NOT NULL,
  "subcategory" TEXT NOT NULL,
  "details" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SkuDefinition_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SkuDefinition_skuCode_key" ON "SkuDefinition"("skuCode");
CREATE INDEX IF NOT EXISTS "SkuDefinition_skuCode_idx" ON "SkuDefinition"("skuCode");
