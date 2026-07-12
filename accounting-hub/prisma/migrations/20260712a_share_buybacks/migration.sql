-- Multiple buybacks per common shareholder: child table + backfill of the legacy
-- single-buyback columns (idempotent).
CREATE TABLE IF NOT EXISTS "ShareBuyback" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "commonShareId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "shares" DECIMAL(65,30) NOT NULL,
  "price" DECIMAL(65,30) NOT NULL,
  "bankAccountId" TEXT,
  "treasuryAccountId" TEXT,
  "journalEntryId" TEXT,
  "proofUrls" JSONB,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ShareBuyback_commonShareId_idx" ON "ShareBuyback"("commonShareId");
DO $$ BEGIN
  ALTER TABLE "ShareBuyback" ADD CONSTRAINT "ShareBuyback_commonShareId_fkey"
    FOREIGN KEY ("commonShareId") REFERENCES "CommonShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Backfill: move each existing single buyback into a ShareBuyback row (once).
INSERT INTO "ShareBuyback" ("id","commonShareId","date","shares","price","bankAccountId","treasuryAccountId","journalEntryId","proofUrls","createdAt")
SELECT 'bkfill_' || c."id", c."id", c."dateAcquired", c."buybackShares", c."buybackPrice",
       c."buybackBankAccountId", c."treasuryAccountId", c."buybackJournalEntryId", c."buybackProofUrls", CURRENT_TIMESTAMP
FROM "CommonShare" c
WHERE c."boughtBack" = true AND c."buybackShares" IS NOT NULL AND c."buybackShares" > 0
  AND NOT EXISTS (SELECT 1 FROM "ShareBuyback" b WHERE b."commonShareId" = c."id");
