-- Local synced cache of HR Platform's Branches Registry. Idempotent
-- (replayed on every deploy). Populated by POST /api/branches/sync,
-- read by GET /api/public/branches (unauthenticated, Class Portal /
-- Client Portal go through this via booking-proxy).
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
