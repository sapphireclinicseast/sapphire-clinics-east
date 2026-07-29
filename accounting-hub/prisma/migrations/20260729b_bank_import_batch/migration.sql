-- Group each statement upload so it can be undone as a unit.
--
-- BankTransaction.importBatch already existed but held a non-unique string
-- ("imp_<userId>_<firstRowDate>"), which cannot identify one upload: two files
-- loaded by the same user starting on the same date collide. Uploads get
-- corrected and repeated often, so a real batch record is needed to list what
-- was loaded and to remove exactly those rows again.
CREATE TABLE IF NOT EXISTS "BankImportBatch" (
    "id" TEXT NOT NULL,
    "bankAccountId" TEXT NOT NULL,
    "fileName" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BankImportBatch_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "BankImportBatch_bankAccountId_idx" ON "BankImportBatch"("bankAccountId");

-- Existing rows keep their legacy importBatch string; they simply have no batch
-- record and are listed as "Earlier upload" until replaced.
