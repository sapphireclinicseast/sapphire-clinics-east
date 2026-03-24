-- Add isBundle flag to InventoryItem
DO $$ BEGIN
  ALTER TABLE "InventoryItem" ADD COLUMN "isBundle" BOOLEAN NOT NULL DEFAULT false;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

CREATE INDEX IF NOT EXISTS "InventoryItem_isBundle_idx" ON "InventoryItem"("isBundle");

-- Create BundleComponent table
CREATE TABLE IF NOT EXISTS "BundleComponent" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "bundleId" TEXT NOT NULL,
  "componentId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "BundleComponent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "BundleComponent_bundleId_fkey" FOREIGN KEY ("bundleId") REFERENCES "InventoryItem"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "BundleComponent_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "BundleComponent_bundleId_componentId_key" UNIQUE ("bundleId", "componentId")
);

CREATE INDEX IF NOT EXISTS "BundleComponent_bundleId_idx" ON "BundleComponent"("bundleId");
CREATE INDEX IF NOT EXISTS "BundleComponent_componentId_idx" ON "BundleComponent"("componentId");
