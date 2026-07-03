ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "photoUrls" JSONB;
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "isDefective" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "AssetAudit" (
  "id" TEXT NOT NULL,
  "refNumber" TEXT NOT NULL,
  "refSeq" INTEGER NOT NULL,
  "dateFrom" TIMESTAMP(3) NOT NULL,
  "dateTo" TIMESTAMP(3) NOT NULL,
  "auditorName" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "departments" JSONB NOT NULL DEFAULT '[]',
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "proofUrls" JSONB,
  "finalizedAt" TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetAudit_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "AssetAudit_refNumber_key" ON "AssetAudit"("refNumber");
CREATE INDEX IF NOT EXISTS "AssetAudit_branch_idx" ON "AssetAudit"("branch");

CREATE TABLE IF NOT EXISTS "AssetAuditItem" (
  "id" TEXT NOT NULL,
  "auditId" TEXT NOT NULL,
  "assetId" TEXT NOT NULL,
  "assetName" TEXT NOT NULL,
  "controlNumber" TEXT,
  "classification" TEXT,
  "accountableName" TEXT,
  "usable" BOOLEAN,
  "needsReplacement" BOOLEAN NOT NULL DEFAULT false,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AssetAuditItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AssetAuditItem_auditId_idx" ON "AssetAuditItem"("auditId");
CREATE INDEX IF NOT EXISTS "AssetAuditItem_assetId_idx" ON "AssetAuditItem"("assetId");
DO $$ BEGIN
  ALTER TABLE "AssetAuditItem" ADD CONSTRAINT "AssetAuditItem_auditId_fkey" FOREIGN KEY ("auditId") REFERENCES "AssetAudit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
