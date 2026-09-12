-- Local synced cache of HR Platform's Partner Institutions module. Idempotent
-- (replayed on every deploy), same pattern as HrBranch (20260818). Populated
-- by POST /api/partner-institutions/sync (and its nightly cron), read by
-- GET /api/partner-institutions for the Front Desk / Clinic Tools page.
-- View-only on this side — no writes back to HR.
CREATE TABLE IF NOT EXISTS "PartnerInstitution" (
  "id"              TEXT NOT NULL,
  "hrPlatformId"    TEXT NOT NULL,
  "name"            TEXT NOT NULL,
  "type"            TEXT NOT NULL,
  "typeLabel"       TEXT NOT NULL,
  "pointOfContact"  TEXT,
  "email"           TEXT,
  "mobile"          TEXT,
  "telephone"       TEXT,
  "services"        JSONB NOT NULL DEFAULT '[]',
  "discounts"       JSONB NOT NULL DEFAULT '[]',
  "agreementType"   TEXT NOT NULL,
  "effectivityFrom" TIMESTAMP(3),
  "effectivityTo"   TIMESTAMP(3),
  "hasCommission"   BOOLEAN NOT NULL DEFAULT false,
  "commissionType"  TEXT NOT NULL DEFAULT 'percent',
  "commissionValue" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "commissionNote"  TEXT,
  "hasDocument"     BOOLEAN NOT NULL DEFAULT false,
  "photoCount"      INTEGER NOT NULL DEFAULT 0,
  "remarks"         TEXT,
  "active"          BOOLEAN NOT NULL DEFAULT true,
  "syncedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "hrUpdatedAt"     TIMESTAMP(3) NOT NULL,
  "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PartnerInstitution_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "PartnerInstitution_hrPlatformId_key" ON "PartnerInstitution"("hrPlatformId");
