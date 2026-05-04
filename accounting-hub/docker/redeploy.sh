#!/bin/bash
# Quick redeploy for SAPPHIRE Accounting Hub
# Rebuilds app image, restarts containers, and syncs DB password
set -e
cd /opt/accounting/docker

# ── AUTO-BACKUP before every deploy ───────────────────────────────────────────
STAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR="/opt/backups/accounting_source"
DB_BACKUP_DIR="/opt/backups/accounting_db"
mkdir -p "$BACKUP_DIR" "$DB_BACKUP_DIR"

echo "Pre-deploy backup: source → ${BACKUP_DIR}/pre_deploy_${STAMP}.tar.gz"
tar -czf "${BACKUP_DIR}/pre_deploy_${STAMP}.tar.gz" \
  -C /opt/accounting \
  --exclude='node_modules' --exclude='.next' --exclude='.git' \
  . && echo "  Source backup OK."

# DB backup only if postgres is running
if docker exec accounting_db pg_isready -U sapphire -d sapphire_accounting >/dev/null 2>&1; then
  echo "Pre-deploy backup: database → ${DB_BACKUP_DIR}/pre_deploy_${STAMP}.sql.gz"
  docker exec accounting_db pg_dump -U sapphire sapphire_accounting \
    | gzip > "${DB_BACKUP_DIR}/pre_deploy_${STAMP}.sql.gz" \
    && echo "  DB backup OK."
else
  echo "  DB not running — skipping DB backup."
fi

# Keep only the 10 most recent source backups (pre_deploy_* only) to save disk
ls -t "${BACKUP_DIR}"/pre_deploy_*.tar.gz 2>/dev/null | tail -n +11 | xargs -r rm --
# Keep only the 10 most recent DB backups
ls -t "${DB_BACKUP_DIR}"/pre_deploy_*.sql.gz 2>/dev/null | tail -n +11 | xargs -r rm --
echo "─────────────────────────────────────────────────────────────────────────"

echo "Building app image..."
# Build directly with docker build (not docker compose build) so the image is
# always written into the local Docker daemon image store. docker compose build
# uses Buildx which stores to its own content-addressable cache; docker compose
# up then silently reuses the old local image. docker build always loads to local.
cd /opt/accounting
docker build -f docker/Dockerfile -t accounting-app --no-cache .
cd /opt/accounting/docker

echo "Restarting containers..."
# Force-recreate the app so any .env changes (DATABASE_URL etc.) are picked up.
# Without this, docker compose can leave the old container running with stale env.
# Listing the service name ('app') and --force-recreate limits the recreation
# to the app container — postgres is brought up (or left running) as a dep but
# never recreated, so no data-volume re-init race.
docker compose up -d --force-recreate app

echo "Waiting for postgres to be healthy..."
for i in $(seq 1 20); do
  if docker exec accounting_db pg_isready -U sapphire -d sapphire_accounting >/dev/null 2>&1; then
    echo "  postgres ready."
    break
  fi
  sleep 1
done

echo "Syncing database password..."
PGPASS=$(grep "^POSTGRES_PASSWORD=" .env | cut -d= -f2-)
docker exec accounting_db psql -U sapphire -d sapphire_accounting \
  -c "ALTER USER sapphire WITH PASSWORD '$PGPASS';" 2>/dev/null \
  && echo "Password synced." \
  || echo "Warning: password sync failed — run ALTER USER manually if login fails."

echo "Applying additive schema changes (IF NOT EXISTS — idempotent)..."
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "arProofUrl" TEXT;
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "arCustomDate" TIMESTAMP(3);
ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'HMO_OFFICER';
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "birAddress" TEXT;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "bioId" INTEGER;
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'SIL';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'BDAY';
ALTER TYPE "LeaveType" ADD VALUE IF NOT EXISTS 'TRAINING';
ALTER TABLE "EmployeeSettings" ADD COLUMN IF NOT EXISTS "leaveMaxDays" JSONB;
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "attachmentUrls" JSONB;
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "soaStatus" TEXT DEFAULT 'With GL/No SOA';

-- SOA Settings (singleton row for bank details, signatories)
CREATE TABLE IF NOT EXISTS "SoaSettings" (
    "id"                   TEXT        NOT NULL DEFAULT 'singleton',
    "clinicName"           TEXT,
    "clinicAddress"        TEXT,
    "bankName"             TEXT,
    "bankBranch"           TEXT,
    "bankAccountName"      TEXT,
    "bankAccountNo"        TEXT,
    "hmoOfficerName"       TEXT,
    "hmoOfficerEsigUrl"    TEXT,
    "clinicManagerName"    TEXT,
    "clinicManagerEsigUrl" TEXT,
    "contactEmail"         TEXT,
    "contactPhone1"        TEXT,
    "contactPhone2"        TEXT,
    "updatedAt"            TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SoaSettings_pkey" PRIMARY KEY ("id")
);

-- SOA Records (generated PDFs stored as base64)
CREATE TABLE IF NOT EXISTS "SoaRecord" (
    "id"              TEXT        NOT NULL,
    "walletId"        TEXT        NOT NULL,
    "walletName"      TEXT        NOT NULL,
    "period"          TEXT        NOT NULL,
    "pdfData"         TEXT,
    "branch"          TEXT,
    "isHighlighted"   BOOLEAN     NOT NULL DEFAULT false,
    "generatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "generatedById"   TEXT,
    "generatedByName" TEXT,
    CONSTRAINT "SoaRecord_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SoaRecord_walletId_period_idx" ON "SoaRecord"("walletId", "period");
CREATE INDEX IF NOT EXISTS "SoaRecord_period_idx" ON "SoaRecord"("period");

-- IE/PR Payroll Tracking table (cross-app link with teletherapy hub)
CREATE TABLE IF NOT EXISTS "IEPRPayrollRecord" (
    "id"               TEXT        NOT NULL,
    "documentId"       TEXT        NOT NULL,
    "staffId"          TEXT,
    "countedInPayroll" BOOLEAN     NOT NULL DEFAULT false,
    "cutoffPeriod"     TEXT,
    "notes"            TEXT,
    "markedById"       TEXT,
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IEPRPayrollRecord_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "IEPRPayrollRecord_documentId_key"
    ON "IEPRPayrollRecord"("documentId");
CREATE INDEX IF NOT EXISTS "IEPRPayrollRecord_documentId_idx"
    ON "IEPRPayrollRecord"("documentId");
CREATE INDEX IF NOT EXISTS "IEPRPayrollRecord_staffId_idx"
    ON "IEPRPayrollRecord"("staffId");
CREATE INDEX IF NOT EXISTS "IEPRPayrollRecord_countedInPayroll_idx"
    ON "IEPRPayrollRecord"("countedInPayroll");
CREATE INDEX IF NOT EXISTS "IEPRPayrollRecord_cutoffPeriod_idx"
    ON "IEPRPayrollRecord"("cutoffPeriod");

-- Invoice Settings (per-branch: company name, trade name, address, phone shown on invoices)
CREATE TABLE IF NOT EXISTS "InvoiceSettings" (
    "branch"      TEXT        NOT NULL,
    "companyName" TEXT,
    "tradeName"   TEXT,
    "address"     TEXT,
    "phone"       TEXT,
    "email"       TEXT,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InvoiceSettings_pkey" PRIMARY KEY ("branch")
);
ALTER TABLE "InvoiceSettings" ADD COLUMN IF NOT EXISTS "tradeName" TEXT;

-- Tier 2.1: Beginning Balances per account per fiscal year.
-- Required so the Balance Sheet reflects cumulative state (opening Cash,
-- Owner's Equity, Retained Earnings) instead of just current-year flows.
CREATE TABLE IF NOT EXISTS "BeginningBalance" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "periodYear" INTEGER NOT NULL,
    "amount" DECIMAL(65,30) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BeginningBalance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "BeginningBalance_accountId_periodYear_key"
    ON "BeginningBalance"("accountId", "periodYear");
CREATE INDEX IF NOT EXISTS "BeginningBalance_periodYear_idx"
    ON "BeginningBalance"("periodYear");
CREATE INDEX IF NOT EXISTS "BeginningBalance_accountId_idx"
    ON "BeginningBalance"("accountId");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'BeginningBalance_accountId_fkey'
  ) THEN
    ALTER TABLE "BeginningBalance"
      ADD CONSTRAINT "BeginningBalance_accountId_fkey"
      FOREIGN KEY ("accountId") REFERENCES "Account"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
SQL

echo "Redeploy complete."
