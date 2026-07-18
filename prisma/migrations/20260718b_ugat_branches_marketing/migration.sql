-- Scholar branch preference (comma-joined) + the marketing-asset table (brochure
-- storage). Additive and idempotent.

ALTER TABLE "UgatScholar" ADD COLUMN IF NOT EXISTS "preferredBranches" TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS "UgatMarketingAsset" (
  "id" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "mimeType" TEXT NOT NULL,
  "data" BYTEA NOT NULL,
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatMarketingAsset_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatMarketingAsset_kind_key" ON "UgatMarketingAsset"("kind");
