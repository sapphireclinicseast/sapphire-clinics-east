-- Local synced cache of HR Platform's Branches Registry. Idempotent
-- (also embedded directly in docker/redeploy.sh's additive-schema block,
-- since this app applies schema changes out-of-band, not via
-- `prisma migrate deploy`). Populated by POST /api/branches/sync.
CREATE TABLE IF NOT EXISTS "HrBranch" (
  "id"                      TEXT NOT NULL,
  "shortCode"               TEXT NOT NULL,
  "aliases"                 TEXT[] NOT NULL DEFAULT '{}',
  "opsHubBranch"            TEXT,
  "opsHubClassPortalBranch" TEXT,
  "acctHubBranch"           TEXT,
  "acctHubServiceBranch"    TEXT,
  "teletherapyBranch"       TEXT,
  "name"                    TEXT NOT NULL,
  "brandName"               TEXT,
  "tin"                     TEXT,
  "address"                 TEXT,
  "phone"                   TEXT,
  "emailMain"               TEXT,
  "emailHr"                 TEXT,
  "emailAccounting"         TEXT,
  "departmentsOffered"      TEXT[] NOT NULL DEFAULT '{}',
  "operatingDays"           TEXT[] NOT NULL DEFAULT '{}',
  "operatingHoursOpen"      TEXT,
  "operatingHoursClose"     TEXT,
  "active"                  BOOLEAN NOT NULL DEFAULT true,
  "syncedAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "HrBranch_pkey" PRIMARY KEY ("id")
);
