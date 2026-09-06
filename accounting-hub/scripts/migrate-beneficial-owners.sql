-- Beneficial owners of common shareholdings + Shareholder.mobile
-- Apply by hand on the server (deploy does NOT run DDL):
--   docker exec -i accounting_db psql -U sapphire -d sapphire_accounting < migrate-beneficial-owners.sql

DO $$ BEGIN ALTER TABLE "Shareholder" ADD COLUMN "mobile" TEXT; EXCEPTION WHEN duplicate_column THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "BeneficialOwner" (
  "id"            TEXT NOT NULL PRIMARY KEY,
  "commonShareId" TEXT NOT NULL REFERENCES "CommonShare"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  "name"          TEXT NOT NULL,
  "tin"           TEXT,
  "email"         TEXT,
  "address"       TEXT,
  "shares"        DECIMAL(65,30) NOT NULL,
  "notes"         TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);

CREATE INDEX IF NOT EXISTS "BeneficialOwner_commonShareId_idx" ON "BeneficialOwner"("commonShareId");
