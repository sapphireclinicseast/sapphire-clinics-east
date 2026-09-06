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

# Keep only the 3 most recent source backups (pre_deploy_* only). Each is ~850MB
# because it carries uploads/, so ten of them was 8GB — on a disk that only has
# ~12GB spare while a --no-cache build needs ~11GB of it.
ls -t "${BACKUP_DIR}"/pre_deploy_*.tar.gz 2>/dev/null | tail -n +4 | xargs -r rm --
# Keep 5 pre-deploy DB dumps; the nightly off-site job holds the longer history.
ls -t "${DB_BACKUP_DIR}"/pre_deploy_*.sql.gz 2>/dev/null | tail -n +6 | xargs -r rm --
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
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "diagnosis" TEXT;
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "approvedServices" JSONB;
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "incentives" JSONB NOT NULL DEFAULT '[]';
ALTER TABLE "PayrollEntry" ADD COLUMN IF NOT EXISTS "incentiveTotal" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "rfpBranchMap" JSONB;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "assetAddedAt" TIMESTAMP(3);
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "inventoryRecordedAt" TIMESTAMP(3);
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "fromPettyCash" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "fromPettyCash" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Referrer" ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'DOCTOR';
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "soldFromTreasury" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "retiredShares" DECIMAL(65,30) DEFAULT 0;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "skipReports" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "sourceRecurringId" TEXT;
ALTER TABLE "Service" ADD COLUMN IF NOT EXISTS "isHmoGl" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "payoutAmountPerPeriod" DECIMAL(65,30);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "repaymentMode" TEXT;
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "payoutAmountPerPeriod" DECIMAL(65,30);
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "repaymentMode" TEXT;
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "principalPerPeriod" DECIMAL(65,30);
ALTER TABLE "Loan" ADD COLUMN IF NOT EXISTS "paymentBankAccountId" TEXT;
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "principalPerPeriod" DECIMAL(65,30);
ALTER TABLE "Advance" ADD COLUMN IF NOT EXISTS "paymentBankAccountId" TEXT;
ALTER TABLE "ARPayment" ADD COLUMN IF NOT EXISTS "overpayment" DECIMAL(65,30) NOT NULL DEFAULT 0;
ALTER TABLE "ARPayment" ADD COLUMN IF NOT EXISTS "overpaymentAccountId" TEXT;
ALTER TABLE "ConsultantUnitPay" ADD COLUMN IF NOT EXISTS "branchAmounts" JSONB;
CREATE TABLE IF NOT EXISTS "PosSettlementBatch" (
    "id"                TEXT NOT NULL,
    "bankTransactionId" TEXT NOT NULL,
    "paymentModeId"     TEXT,
    "label"             TEXT NOT NULL,
    "grossTotal"        DECIMAL(65,30) NOT NULL DEFAULT 0,
    "netTotal"          DECIMAL(65,30) NOT NULL DEFAULT 0,
    "createdById"       TEXT,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PosSettlementBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PosSettlementBatch_bankTransactionId_key" ON "PosSettlementBatch"("bankTransactionId");
CREATE TABLE IF NOT EXISTS "PosSettlementPayment" (
    "id"             TEXT NOT NULL,
    "batchId"        TEXT NOT NULL,
    "orderPaymentId" TEXT NOT NULL,
    "amount"         DECIMAL(65,30) NOT NULL DEFAULT 0,
    CONSTRAINT "PosSettlementPayment_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "PosSettlementPayment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PosSettlementBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS "PosSettlementPayment_orderPaymentId_key" ON "PosSettlementPayment"("orderPaymentId");
CREATE INDEX IF NOT EXISTS "PosSettlementPayment_batchId_idx" ON "PosSettlementPayment"("batchId");
ALTER TABLE "PaymentModeDeduction" ADD COLUMN IF NOT EXISTS "effectiveFrom" TIMESTAMP(3);
ALTER TABLE "PaymentModeDeduction" ADD COLUMN IF NOT EXISTS "effectiveTo" TIMESTAMP(3);
ALTER TABLE "PaymentMode" ADD COLUMN IF NOT EXISTS "settlementBankAccountId" TEXT;
ALTER TABLE "SalesDayClearing" ADD COLUMN IF NOT EXISTS "confirmed" JSONB;

-- PayMongo checkout/payment tracking (Phase 1)
CREATE TABLE IF NOT EXISTS "PaymongoCheckout" (
    "id"            TEXT NOT NULL,
    "checkoutId"    TEXT NOT NULL,
    "referenceCode" TEXT,
    "orderId"       TEXT,
    "branch"        TEXT,
    "description"   TEXT,
    "amount"        DECIMAL(65,30) NOT NULL,
    "status"        TEXT NOT NULL DEFAULT 'PENDING',
    "checkoutUrl"   TEXT,
    "paymentId"     TEXT,
    "fee"           DECIMAL(65,30),
    "netAmount"     DECIMAL(65,30),
    "paidAt"        TIMESTAMP(3),
    "payoutId"      TEXT,
    "livemode"      BOOLEAN NOT NULL DEFAULT false,
    "raw"           JSONB,
    "createdById"   TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PaymongoCheckout_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "PaymongoCheckout_checkoutId_key" ON "PaymongoCheckout"("checkoutId");
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_status_idx" ON "PaymongoCheckout"("status");
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_orderId_idx" ON "PaymongoCheckout"("orderId");
CREATE INDEX IF NOT EXISTS "PaymongoCheckout_payoutId_idx" ON "PaymongoCheckout"("payoutId");

-- Equity Settings (singleton): authorized shares anchor; Treasury = authorized − outstanding
CREATE TABLE IF NOT EXISTS "EquitySettings" (
    "id"               TEXT    NOT NULL DEFAULT 'singleton',
    "authorizedShares" INTEGER NOT NULL DEFAULT 20000000,
    "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EquitySettings_pkey" PRIMARY KEY ("id")
);

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

-- Inventory item dimensions for CBM-based freight allocation
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "dimensionLength" DECIMAL(65,30);
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "dimensionWidth"  DECIMAL(65,30);
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "dimensionHeight" DECIMAL(65,30);
-- Shipping weight (kg) — feeds the shipping rates on verdanarehab.com
ALTER TABLE "InventoryItem" ADD COLUMN IF NOT EXISTS "weightKg" DECIMAL(65,30);

-- Supplier purchase requests: what we are asking a supplier for, and who asked
CREATE TABLE IF NOT EXISTS "SupplierRequest" (
  "id" TEXT NOT NULL,
  "referenceNumber" TEXT NOT NULL,
  "supplierId" TEXT NOT NULL,
  "requestDate" TIMESTAMP(3) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "remarks" TEXT,
  "preparedByName" TEXT NOT NULL,
  "preparedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierRequest_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SupplierRequest_referenceNumber_key" ON "SupplierRequest"("referenceNumber");
CREATE INDEX IF NOT EXISTS "SupplierRequest_supplierId_idx" ON "SupplierRequest"("supplierId");
CREATE INDEX IF NOT EXISTS "SupplierRequest_requestDate_idx" ON "SupplierRequest"("requestDate");
DO $$ BEGIN
  ALTER TABLE "SupplierRequest" ADD CONSTRAINT "SupplierRequest_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierRequest" ADD CONSTRAINT "SupplierRequest_preparedById_fkey" FOREIGN KEY ("preparedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "SupplierRequestItem" (
  "id" TEXT NOT NULL,
  "requestId" TEXT NOT NULL,
  "itemId" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SupplierRequestItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "SupplierRequestItem_requestId_idx" ON "SupplierRequestItem"("requestId");
CREATE INDEX IF NOT EXISTS "SupplierRequestItem_itemId_idx" ON "SupplierRequestItem"("itemId");
DO $$ BEGIN
  ALTER TABLE "SupplierRequestItem" ADD CONSTRAINT "SupplierRequestItem_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "SupplierRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "SupplierRequestItem" ADD CONSTRAINT "SupplierRequestItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Per-variant physical specs (NULL = inherit the parent item). Size variants
-- ship in different boxes, so LWH + weight are settable per variant; the
-- storefront charges shipping by the variant's weight.
ALTER TABLE "InventoryVariant" ADD COLUMN IF NOT EXISTS "dimensionLength" DECIMAL(10,2);
ALTER TABLE "InventoryVariant" ADD COLUMN IF NOT EXISTS "dimensionWidth"  DECIMAL(10,2);
ALTER TABLE "InventoryVariant" ADD COLUMN IF NOT EXISTS "dimensionHeight" DECIMAL(10,2);
ALTER TABLE "InventoryVariant" ADD COLUMN IF NOT EXISTS "weightKg"        DECIMAL(10,3);

-- Inventory adjustment: display reference + batch FK
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "referenceNumber" TEXT;
ALTER TABLE "InventoryAdjustment" ADD COLUMN IF NOT EXISTS "batchRefId"      TEXT;
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_batchRefId_idx" ON "InventoryAdjustment"("batchRefId");

-- Freight allocation batch table
CREATE TABLE IF NOT EXISTS "InventoryAdjustmentBatch" (
    "id"                 TEXT NOT NULL,
    "referenceNumber"    TEXT NOT NULL,
    "adjustmentDate"     TIMESTAMP(3) NOT NULL,
    "hasForeignPurchase" BOOLEAN NOT NULL DEFAULT true,
    "foreignCurrency"    TEXT,
    "exchangeRate"       DECIMAL(65,30),
    "freight1Amount"     DECIMAL(65,30),
    "freight1IsForeign"  BOOLEAN NOT NULL DEFAULT false,
    "freight2Amount"     DECIMAL(65,30),
    "freight2IsForeign"  BOOLEAN NOT NULL DEFAULT false,
    "freight3Amount"     DECIMAL(65,30),
    "freight3IsForeign"  BOOLEAN NOT NULL DEFAULT false,
    "totalFreightPHP"    DECIMAL(65,30) NOT NULL DEFAULT 0,
    "proofUrls"          JSONB,
    "remarks"            TEXT,
    "createdById"        TEXT NOT NULL,
    "createdAt"          TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "InventoryAdjustmentBatch_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "InventoryAdjustmentBatch_referenceNumber_key"
    ON "InventoryAdjustmentBatch"("referenceNumber");
CREATE INDEX IF NOT EXISTS "InventoryAdjustmentBatch_createdById_idx"
    ON "InventoryAdjustmentBatch"("createdById");
CREATE INDEX IF NOT EXISTS "InventoryAdjustmentBatch_adjustmentDate_idx"
    ON "InventoryAdjustmentBatch"("adjustmentDate");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryAdjustmentBatch_createdById_fkey'
  ) THEN
    ALTER TABLE "InventoryAdjustmentBatch"
      ADD CONSTRAINT "InventoryAdjustmentBatch_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'InventoryAdjustment_batchRefId_fkey'
  ) THEN
    ALTER TABLE "InventoryAdjustment"
      ADD CONSTRAINT "InventoryAdjustment_batchRefId_fkey"
      FOREIGN KEY ("batchRefId") REFERENCES "InventoryAdjustmentBatch"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
-- Cutoff 1 resignation toggle: compute monthly withholding tax on cutoff 1 instead of waiting for cutoff 2
ALTER TABLE "EmployeePayslip" ADD COLUMN IF NOT EXISTS "computeTaxNow" BOOLEAN NOT NULL DEFAULT false;

-- AR payment: Sales Invoice number issued for an HMO/GL collection
ALTER TABLE "ARPayment" ADD COLUMN IF NOT EXISTS "salesInvoiceNumber" TEXT;

-- Cancelled check: scanned image(s)
ALTER TABLE "CancelledCheck" ADD COLUMN IF NOT EXISTS "proofUrls" JSONB;

-- Sales-invoice flag: tag a missing SI number to an existing order
ALTER TABLE "SalesInvoiceFlag" ADD COLUMN IF NOT EXISTS "orderId" TEXT;

-- Unpaid orders: session recorded now, cash collected later on paymentDate
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentStatus" TEXT NOT NULL DEFAULT 'PAID';
ALTER TABLE "Order" ADD COLUMN IF NOT EXISTS "paymentDate" TIMESTAMP(3);

-- Asset purchase funding source: bank/COA account credited on the acquisition JE
ALTER TABLE "Asset" ADD COLUMN IF NOT EXISTS "sourceAccountId" TEXT;

-- Half-session threshold counts (0.5 increments): thresholdQty Int -> Decimal
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'Service' AND column_name = 'thresholdQty') = 'integer' THEN
    ALTER TABLE "Service" ALTER COLUMN "thresholdQty" TYPE DECIMAL(65,30);
  END IF;
END $$;

-- Package per-service session cost (0.5 steps): a package's eligible service can
-- consume 0.5 / 1 / 1.5 / 2 ... sessions per unit.
ALTER TABLE "ServiceEligibility" ADD COLUMN IF NOT EXISTS "sessionCost" DECIMAL(65,30) NOT NULL DEFAULT 1;
DO $$ BEGIN
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'WalletPackage' AND column_name = 'usedSessions') = 'integer' THEN
    ALTER TABLE "WalletPackage" ALTER COLUMN "usedSessions" TYPE DECIMAL(65,30);
  END IF;
  IF (SELECT data_type FROM information_schema.columns WHERE table_name = 'WalletLog' AND column_name = 'sessions') = 'integer' THEN
    ALTER TABLE "WalletLog" ALTER COLUMN "sessions" TYPE DECIMAL(65,30);
  END IF;
END $$;

-- QR phone-upload sessions
CREATE TABLE IF NOT EXISTS "UploadSession" (
  "id" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "urls" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UploadSession_expiresAt_idx" ON "UploadSession"("expiresAt");

-- Equity: shareholders, common/preferred shares, dividends
CREATE TABLE IF NOT EXISTS "Shareholder" (
  "id" TEXT NOT NULL, "shNumber" TEXT NOT NULL, "shSeq" INTEGER NOT NULL,
  "name" TEXT NOT NULL, "tin" TEXT, "birthdate" TIMESTAMP(3), "email" TEXT, "address" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Shareholder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "Shareholder_shNumber_key" ON "Shareholder"("shNumber");
CREATE UNIQUE INDEX IF NOT EXISTS "Shareholder_shSeq_key" ON "Shareholder"("shSeq");

CREATE TABLE IF NOT EXISTS "CommonShare" (
  "id" TEXT NOT NULL, "shareholderId" TEXT NOT NULL, "dateAcquired" TIMESTAMP(3) NOT NULL,
  "agreementType" TEXT NOT NULL, "assignedToShareholderId" TEXT, "agreementUrls" JSONB,
  "stockCertNumber" TEXT, "proofOfDepositUrls" JSONB, "numberOfShares" DECIMAL(65,30) NOT NULL,
  "pricePerShare" DECIMAL(65,30) NOT NULL, "bankAccountId" TEXT, "journalEntryId" TEXT,
  "boughtBack" BOOLEAN NOT NULL DEFAULT false, "buybackPrice" DECIMAL(65,30), "buybackShares" DECIMAL(65,30),
  "buybackBankAccountId" TEXT, "buybackProofUrls" JSONB, "buybackJournalEntryId" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CommonShare_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CommonShare_shareholderId_idx" ON "CommonShare"("shareholderId");

CREATE TABLE IF NOT EXISTS "PreferredShare" (
  "id" TEXT NOT NULL, "shareholderId" TEXT NOT NULL, "dateAcquired" TIMESTAMP(3) NOT NULL,
  "agreementType" TEXT NOT NULL, "agreementUrls" JSONB, "stockCertNumber" TEXT, "proofOfDepositUrls" JSONB,
  "numberOfShares" DECIMAL(65,30) NOT NULL, "pricePerShare" DECIMAL(65,30) NOT NULL,
  "bankAccountId" TEXT, "journalEntryId" TEXT, "annualInterest" DECIMAL(65,30), "maturityYears" INTEGER,
  "buybackPrice" DECIMAL(65,30), "payoutSchedule" TEXT, "payoutStartMonth" INTEGER, "payoutStartYear" INTEGER,
  "payoutDay" INTEGER, "pdcUrls" JSONB, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreferredShare_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredShare_shareholderId_idx" ON "PreferredShare"("shareholderId");

CREATE TABLE IF NOT EXISTS "PreferredPayout" (
  "id" TEXT NOT NULL, "preferredShareId" TEXT NOT NULL, "shareholderId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL, "amount" DECIMAL(65,30) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidDate" TIMESTAMP(3), "bankAccountId" TEXT, "proofUrls" JSONB, "emailedAt" TIMESTAMP(3),
  "journalEntryId" TEXT, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreferredPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredPayout_preferredShareId_idx" ON "PreferredPayout"("preferredShareId");
CREATE INDEX IF NOT EXISTS "PreferredPayout_dueDate_idx" ON "PreferredPayout"("dueDate");

-- Loans & Advances: Advances
CREATE TABLE IF NOT EXISTS "Advance" (
  "id" TEXT NOT NULL, "shareholderId" TEXT, "name" TEXT NOT NULL, "dateAcquired" TIMESTAMP(3) NOT NULL,
  "advanceType" TEXT NOT NULL, "kindType" TEXT, "principalAmount" DECIMAL(65,30) NOT NULL,
  "hasInterest" BOOLEAN NOT NULL DEFAULT false, "interestMode" TEXT, "annualPct" DECIMAL(65,30), "termMonths" INTEGER,
  "monthlyAmortization" DECIMAL(65,30), "computedAnnualPct" DECIMAL(65,30), "totalInterest" DECIMAL(65,30),
  "proofOfDepositUrls" JSONB, "bankAccountId" TEXT, "creditAccountId" TEXT, "interestExpenseAccountId" TEXT,
  "payoutSchedule" TEXT, "payoutStartMonth" INTEGER, "payoutStartYear" INTEGER, "payoutDay" INTEGER,
  "pdcUrls" JSONB, "remarks" TEXT, "journalEntryId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Advance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Advance_shareholderId_idx" ON "Advance"("shareholderId");
CREATE TABLE IF NOT EXISTS "AdvancePayout" (
  "id" TEXT NOT NULL, "advanceId" TEXT NOT NULL, "dueDate" TIMESTAMP(3) NOT NULL,
  "principalPortion" DECIMAL(65,30) NOT NULL DEFAULT 0, "interestPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount" DECIMAL(65,30) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "paidDate" TIMESTAMP(3),
  "bankAccountId" TEXT, "proofUrls" JSONB, "emailedAt" TIMESTAMP(3), "journalEntryId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdvancePayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "AdvancePayout_advanceId_idx" ON "AdvancePayout"("advanceId");
CREATE INDEX IF NOT EXISTS "AdvancePayout_dueDate_idx" ON "AdvancePayout"("dueDate");
DO $$ BEGIN
  ALTER TABLE "AdvancePayout" ADD CONSTRAINT "AdvancePayout_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "Advance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "DividendRelease" (
  "id" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "boardResolutionUrls" JSONB,
  "dividendAmount" DECIMAL(65,30) NOT NULL, "dividendType" TEXT NOT NULL,
  "totalAmountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0, "status" TEXT NOT NULL DEFAULT 'DRAFT',
  "proofOfDepositUrls" JSONB, "journalEntryId" TEXT, "finalizedAt" TIMESTAMP(3), "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DividendRelease_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "DividendReleaseItem" (
  "id" TEXT NOT NULL, "releaseId" TEXT NOT NULL, "shareholderId" TEXT NOT NULL,
  "shareholderName" TEXT NOT NULL, "shares" DECIMAL(65,30) NOT NULL, "amount" DECIMAL(65,30) NOT NULL,
  "emailedAt" TIMESTAMP(3), CONSTRAINT "DividendReleaseItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "DividendReleaseItem_releaseId_idx" ON "DividendReleaseItem"("releaseId");
ALTER TABLE "DividendRelease" ADD COLUMN IF NOT EXISTS "bankAccountId" TEXT;
ALTER TABLE "DividendRelease" ADD COLUMN IF NOT EXISTS "retainedAccountId" TEXT;
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "equityAccountId" TEXT;
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "treasuryAccountId" TEXT;
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "equityAccountId" TEXT;
DO $$ BEGIN
  ALTER TABLE "CommonShare" ADD CONSTRAINT "CommonShare_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PreferredShare" ADD CONSTRAINT "PreferredShare_shareholderId_fkey" FOREIGN KEY ("shareholderId") REFERENCES "Shareholder"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "PreferredPayout" ADD CONSTRAINT "PreferredPayout_preferredShareId_fkey" FOREIGN KEY ("preferredShareId") REFERENCES "PreferredShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "DividendReleaseItem" ADD CONSTRAINT "DividendReleaseItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "DividendRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Asset audit + asset photo gallery / defective flag
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

-- Cash Advances (event floats): release → liquidate → return → reimburse
CREATE TABLE IF NOT EXISTS "CashAdvance" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "refNumber" TEXT NOT NULL,
  "refSeq" INTEGER NOT NULL,
  "accountableName" TEXT NOT NULL,
  "purpose" TEXT NOT NULL,
  "dateReleased" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "sourceAccountId" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashAdvance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "CashAdvance_branch_refNumber_key" ON "CashAdvance"("branch","refNumber");
CREATE INDEX IF NOT EXISTS "CashAdvance_branch_idx" ON "CashAdvance"("branch");
-- Release proof(s): acknowledgement receipt, approval memo, etc.
ALTER TABLE "CashAdvance" ADD COLUMN IF NOT EXISTS "proofUrls" JSONB;
CREATE TABLE IF NOT EXISTS "CashAdvanceLine" (
  "id" TEXT NOT NULL,
  "advanceId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "accountTitle" TEXT,
  "description" TEXT,
  "vatable" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "siNumber" TEXT,
  "registeredName" TEXT,
  "proofUrl" TEXT,
  "proofUrls" JSONB,
  "bankAccountId" TEXT,
  "journalEntryId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CashAdvanceLine_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "CashAdvanceLine_advanceId_idx" ON "CashAdvanceLine"("advanceId");
DO $$ BEGIN
  ALTER TABLE "CashAdvanceLine" ADD CONSTRAINT "CashAdvanceLine_advanceId_fkey" FOREIGN KEY ("advanceId") REFERENCES "CashAdvance"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Expense-entry parity fields on liquidation lines (BIR supplier info)
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "requestor" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "department" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "validity" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "tinNumber" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "registeredAddress" TEXT;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "hasEwt" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CashAdvanceLine" ADD COLUMN IF NOT EXISTS "ewtRate" INTEGER;

-- Sales-with-SI flag resolutions + monthly sales targets
CREATE TABLE IF NOT EXISTS "SalesInvoiceFlag" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "siNumber" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "remarks" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesInvoiceFlag_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesInvoiceFlag_branch_siNumber_key" ON "SalesInvoiceFlag"("branch","siNumber");
CREATE INDEX IF NOT EXISTS "SalesInvoiceFlag_branch_idx" ON "SalesInvoiceFlag"("branch");
CREATE TABLE IF NOT EXISTS "SalesTarget" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "periodMonth" INTEGER NOT NULL,
  "periodYear" INTEGER NOT NULL,
  "target" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "createdById" TEXT,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SalesTarget_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "SalesTarget_branch_periodMonth_periodYear_key" ON "SalesTarget"("branch","periodMonth","periodYear");
CREATE INDEX IF NOT EXISTS "SalesTarget_branch_idx" ON "SalesTarget"("branch");

-- Allow multiple rows per employee per cutoff (drop legacy unique constraint)
-- Required so employees can have separate allowance + deduction rows in the same cutoff period
DROP INDEX IF EXISTS "CutoffAdjustment_employeeId_cutoffPeriod_branch_key";
CREATE INDEX IF NOT EXISTS "CutoffAdjustment_employeeId_cutoffPeriod_branch_idx" ON "CutoffAdjustment"("employeeId", "cutoffPeriod", "branch");

-- Consultant cutoff adjustments table (mirrors CutoffAdjustment for consultants)
CREATE TABLE IF NOT EXISTS "ConsultantCutoffAdjustment" (
    "id"            TEXT        NOT NULL,
    "consultantId"  TEXT        NOT NULL,
    "cutoffPeriod"  TEXT        NOT NULL,
    "branch"        TEXT        NOT NULL,
    "allowance"     DECIMAL(65,30) NOT NULL DEFAULT 0,
    "allowanceType" TEXT        NOT NULL DEFAULT 'NON_TAXABLE',
    "allowanceLabel" TEXT,
    "deduction"     DECIMAL(65,30) NOT NULL DEFAULT 0,
    "deductionLabel" TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ConsultantCutoffAdjustment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_consultantId_cutoffPeriod_branch_idx" ON "ConsultantCutoffAdjustment"("consultantId", "cutoffPeriod", "branch");
CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_consultantId_idx" ON "ConsultantCutoffAdjustment"("consultantId");
CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_cutoffPeriod_idx" ON "ConsultantCutoffAdjustment"("cutoffPeriod");
CREATE INDEX IF NOT EXISTS "ConsultantCutoffAdjustment_branch_idx" ON "ConsultantCutoffAdjustment"("branch");
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ConsultantCutoffAdjustment_consultantId_fkey'
  ) THEN
    ALTER TABLE "ConsultantCutoffAdjustment"
      ADD CONSTRAINT "ConsultantCutoffAdjustment_consultantId_fkey"
      FOREIGN KEY ("consultantId") REFERENCES "Consultant"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
-- Secondary sales of common shares (Sold Shares in Equity). Seller/buyer settle
-- privately; the company records only the ownership move + a net-zero equity memo JE.
CREATE TABLE IF NOT EXISTS "ShareTransfer" (
  "id" TEXT NOT NULL,
  "fromCommonShareId" TEXT NOT NULL,
  "toCommonShareId" TEXT,
  "toShareholderId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "shares" DECIMAL(65,30) NOT NULL,
  "price" DECIMAL(65,30) NOT NULL,
  "proofUrls" JSONB,
  "journalEntryId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShareTransfer_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ShareTransfer_toCommonShareId_key" ON "ShareTransfer"("toCommonShareId");
CREATE INDEX IF NOT EXISTS "ShareTransfer_fromCommonShareId_idx" ON "ShareTransfer"("fromCommonShareId");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShareTransfer_fromCommonShareId_fkey') THEN
    ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_fromCommonShareId_fkey"
      FOREIGN KEY ("fromCommonShareId") REFERENCES "CommonShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShareTransfer_toCommonShareId_fkey') THEN
    ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_toCommonShareId_fkey"
      FOREIGN KEY ("toCommonShareId") REFERENCES "CommonShare"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ShareTransfer_toShareholderId_fkey') THEN
    ALTER TABLE "ShareTransfer" ADD CONSTRAINT "ShareTransfer_toShareholderId_fkey"
      FOREIGN KEY ("toShareholderId") REFERENCES "Shareholder"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
  END IF;
END$$;
-- Discount vouchers (POS → Services → Vouchers): batches of one-time-use
-- coded vouchers (% / fixed / entire-service-free), redeemed at checkout.
CREATE TABLE IF NOT EXISTS "ServiceVoucherBatch" (
  "id" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "discountKind" TEXT NOT NULL,
  "value" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "validUntil" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceVoucherBatch_pkey" PRIMARY KEY ("id")
);
CREATE TABLE IF NOT EXISTS "ServiceVoucher" (
  "id" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "batchId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "usedAt" TIMESTAMP(3),
  "usedOrderId" TEXT,
  "usedById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceVoucher_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ServiceVoucher_code_key" ON "ServiceVoucher"("code");
CREATE INDEX IF NOT EXISTS "ServiceVoucher_batchId_idx" ON "ServiceVoucher"("batchId");
CREATE INDEX IF NOT EXISTS "ServiceVoucher_status_idx" ON "ServiceVoucher"("status");
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ServiceVoucher_batchId_fkey') THEN
    ALTER TABLE "ServiceVoucher" ADD CONSTRAINT "ServiceVoucher_batchId_fkey"
      FOREIGN KEY ("batchId") REFERENCES "ServiceVoucherBatch"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END$$;
SQL

# ── GL processor payout (Detailed GL → Pay GL Processor) ─────────────────────
# The deploy step deliberately does not replay prisma/migrations, so a schema
# change ships here or it does not ship at all. These three columns are read by
# the AR endpoint, so without them the Guarantee Letters tab fails to load.
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
-- GlCase is created out-of-band like the rest of this schema, so guard on the
-- table existing: on an environment that has not got it yet this is a no-op
-- rather than an error that aborts the rest of the deploy.
DO $$
BEGIN
  IF to_regclass('public."GlCase"') IS NULL THEN
    RAISE NOTICE 'GlCase not present — skipping processor payout columns';
    RETURN;
  END IF;

  ALTER TABLE "GlCase" ADD COLUMN IF NOT EXISTS "processorRfpId" TEXT;
  ALTER TABLE "GlCase" ADD COLUMN IF NOT EXISTS "processorPaidAt" TIMESTAMP(3);
  ALTER TABLE "GlCase" ADD COLUMN IF NOT EXISTS "processorProofUrl" TEXT;

  CREATE INDEX IF NOT EXISTS "GlCase_processorRfpId_idx" ON "GlCase"("processorRfpId");

  -- SET NULL, so deleting an RFP releases its letters for a fresh batch rather
  -- than orphaning them as permanently unpayable.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'GlCase_processorRfpId_fkey') THEN
    ALTER TABLE "GlCase"
      ADD CONSTRAINT "GlCase_processorRfpId_fkey"
      FOREIGN KEY ("processorRfpId") REFERENCES "ReimbursementReport"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END$$;
SQL

# ── Consumable form-stock tracking (control-number ranges) ────────────────────
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
CREATE TABLE IF NOT EXISTS "FormReceipt" (
  "id" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "formType" TEXT NOT NULL,
  "dateReceived" TIMESTAMP(3) NOT NULL,
  "fromControl" TEXT NOT NULL,
  "toControl" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL,
  "remarks" TEXT,
  "createdById" TEXT,
  "createdByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "FormReceipt_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "FormReceipt_branch_idx" ON "FormReceipt"("branch");
CREATE INDEX IF NOT EXISTS "FormReceipt_formType_idx" ON "FormReceipt"("formType");
SQL

# ── Equity: split price into True Par + APIC (per share) + valid-ID uploads ────
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "truePar" DECIMAL(65,30);
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "apic" DECIMAL(65,30);
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "validIdUrls" JSONB;
UPDATE "CommonShare" SET "truePar" = "pricePerShare", "apic" = 0 WHERE "truePar" IS NULL;
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "truePar" DECIMAL(65,30);
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "apic" DECIMAL(65,30);
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "validIdUrls" JSONB;
UPDATE "PreferredShare" SET "truePar" = "pricePerShare", "apic" = 0 WHERE "truePar" IS NULL;
ALTER TABLE "CommonShare" ADD COLUMN IF NOT EXISTS "shareClass" TEXT;
ALTER TABLE "PreferredShare" ADD COLUMN IF NOT EXISTS "shareClass" TEXT;
SQL

# ── Loans & Advances: Loans section (Loan + charges + payouts) ─────────────────
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
CREATE TABLE IF NOT EXISTS "Loan" (
  "id" TEXT NOT NULL, "loanEntity" TEXT NOT NULL, "shareholderId" TEXT, "entityName" TEXT,
  "name" TEXT NOT NULL, "dateAcquired" TIMESTAMP(3) NOT NULL, "loanType" TEXT NOT NULL, "kindType" TEXT,
  "principalAmount" DECIMAL(65,30) NOT NULL, "hasInterest" BOOLEAN NOT NULL DEFAULT false, "interestMode" TEXT,
  "annualPct" DECIMAL(65,30), "termMonths" INTEGER, "monthlyAmortization" DECIMAL(65,30), "computedAnnualPct" DECIMAL(65,30),
  "totalInterest" DECIMAL(65,30), "maturityDate" TIMESTAMP(3), "proofOfDepositUrls" JSONB, "bankAccountId" TEXT,
  "creditAccountId" TEXT, "interestExpenseAccountId" TEXT, "payoutSchedule" TEXT, "payoutStartMonth" INTEGER,
  "payoutStartYear" INTEGER, "payoutDay" INTEGER, "loanAgreementUrls" JSONB, "pdcUrls" JSONB, "netAmountToDebit" DECIMAL(65,30),
  "remarks" TEXT, "fromCreditLineId" TEXT, "journalEntryId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Loan_shareholderId_idx" ON "Loan"("shareholderId");
CREATE INDEX IF NOT EXISTS "Loan_fromCreditLineId_idx" ON "Loan"("fromCreditLineId");
CREATE TABLE IF NOT EXISTS "LoanCharge" (
  "id" TEXT NOT NULL, "loanId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "description" TEXT NOT NULL,
  "registeredName" TEXT, "vatable" TEXT, "amount" DECIMAL(65,30) NOT NULL, "siNumber" TEXT, "chargeAccountId" TEXT,
  "deductedFromDebit" BOOLEAN NOT NULL DEFAULT false, "proofUrls" JSONB, "pettyCashEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, CONSTRAINT "LoanCharge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoanCharge_loanId_idx" ON "LoanCharge"("loanId");
CREATE TABLE IF NOT EXISTS "LoanPayout" (
  "id" TEXT NOT NULL, "loanId" TEXT NOT NULL, "dueDate" TIMESTAMP(3) NOT NULL,
  "principalPortion" DECIMAL(65,30) NOT NULL DEFAULT 0, "interestPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount" DECIMAL(65,30) NOT NULL, "status" TEXT NOT NULL DEFAULT 'PENDING', "paidDate" TIMESTAMP(3),
  "bankAccountId" TEXT, "proofUrls" JSONB, "emailedAt" TIMESTAMP(3), "journalEntryId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoanPayout_loanId_idx" ON "LoanPayout"("loanId");
CREATE INDEX IF NOT EXISTS "LoanPayout_dueDate_idx" ON "LoanPayout"("dueDate");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'LoanCharge_loanId_fkey') THEN
    ALTER TABLE "LoanCharge" ADD CONSTRAINT "LoanCharge_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'LoanPayout_loanId_fkey') THEN
    ALTER TABLE "LoanPayout" ADD CONSTRAINT "LoanPayout_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
CREATE TABLE IF NOT EXISTS "CreditLine" (
  "id" TEXT NOT NULL, "entityName" TEXT NOT NULL, "amount" DECIMAL(65,30) NOT NULL, "interestPct" DECIMAL(65,30),
  "utilized" BOOLEAN NOT NULL DEFAULT false, "settledAt" TIMESTAMP(3), "settledJournalEntryId" TEXT, "remarks" TEXT,
  "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLine_pkey" PRIMARY KEY ("id")
);
SQL

# ── CEO shared-entry per-branch EWT remittance ────────────────────────────────
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
ALTER TABLE "PettyCashEntry" ADD COLUMN IF NOT EXISTS "ewtRemittedBranches" JSONB;
SQL

# ── Preferred-share dividend releases ─────────────────────────────────────────
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
CREATE TABLE IF NOT EXISTS "PreferredDividendRelease" (
  "id" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL, "quarterKey" TEXT NOT NULL, "periodLabel" TEXT,
  "proofOfDepositUrls" JSONB, "bankAccountId" TEXT, "expenseAccountId" TEXT, "journalEntryId" TEXT,
  "totalAmountPaid" DECIMAL(65,30) NOT NULL DEFAULT 0, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PreferredDividendRelease_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredDividendRelease_quarterKey_idx" ON "PreferredDividendRelease"("quarterKey");
CREATE TABLE IF NOT EXISTS "PreferredDividendItem" (
  "id" TEXT NOT NULL, "releaseId" TEXT NOT NULL, "shareholderId" TEXT NOT NULL, "shareholderName" TEXT NOT NULL,
  "shares" DECIMAL(65,30) NOT NULL, "amount" DECIMAL(65,30) NOT NULL, "paidDate" TIMESTAMP(3), "emailedAt" TIMESTAMP(3),
  CONSTRAINT "PreferredDividendItem_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "PreferredDividendItem_releaseId_idx" ON "PreferredDividendItem"("releaseId");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'PreferredDividendItem_releaseId_fkey') THEN
    ALTER TABLE "PreferredDividendItem" ADD CONSTRAINT "PreferredDividendItem_releaseId_fkey" FOREIGN KEY ("releaseId") REFERENCES "PreferredDividendRelease"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
-- Multiple buybacks per common shareholder
CREATE TABLE IF NOT EXISTS "ShareBuyback" (
  "id" TEXT NOT NULL PRIMARY KEY, "commonShareId" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL,
  "shares" DECIMAL(65,30) NOT NULL, "price" DECIMAL(65,30) NOT NULL, "bankAccountId" TEXT, "treasuryAccountId" TEXT,
  "journalEntryId" TEXT, "proofUrls" JSONB, "createdById" TEXT, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ShareBuyback_commonShareId_idx" ON "ShareBuyback"("commonShareId");
DO $$ BEGIN
  ALTER TABLE "ShareBuyback" ADD CONSTRAINT "ShareBuyback_commonShareId_fkey" FOREIGN KEY ("commonShareId") REFERENCES "CommonShare"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
INSERT INTO "ShareBuyback" ("id","commonShareId","date","shares","price","bankAccountId","treasuryAccountId","journalEntryId","proofUrls","createdAt")
SELECT 'bkfill_' || c."id", c."id", c."dateAcquired", c."buybackShares", c."buybackPrice",
       c."buybackBankAccountId", c."treasuryAccountId", c."buybackJournalEntryId", c."buybackProofUrls", CURRENT_TIMESTAMP
FROM "CommonShare" c
WHERE c."boughtBack" = true AND c."buybackShares" IS NOT NULL AND c."buybackShares" > 0
  AND NOT EXISTS (SELECT 1 FROM "ShareBuyback" b WHERE b."commonShareId" = c."id");
SQL

# ── Scholars: award terms + monthly releases ──────────────────────────────────
docker exec -i accounting_db psql -U sapphire -d sapphire_accounting <<'SQL'
CREATE TABLE IF NOT EXISTS "ScholarAward" (
  "id" TEXT NOT NULL, "portalScholarId" TEXT NOT NULL, "scholarName" TEXT NOT NULL, "school" TEXT, "email" TEXT,
  "academicYear" TEXT, "scholarshipType" TEXT, "amountAwarded" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "monthlyAmount" DECIMAL(65,30) NOT NULL DEFAULT 0, "startMonth" TEXT, "releaseDay" INTEGER, "numberOfMonths" INTEGER,
  "signedRsaUrls" JSONB, "bankAccountId" TEXT, "expenseAccountId" TEXT, "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScholarAward_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScholarAward_portalScholarId_key" ON "ScholarAward"("portalScholarId");
CREATE INDEX IF NOT EXISTS "ScholarAward_academicYear_idx" ON "ScholarAward"("academicYear");
CREATE INDEX IF NOT EXISTS "ScholarAward_school_idx" ON "ScholarAward"("school");
CREATE TABLE IF NOT EXISTS "ScholarRelease" (
  "id" TEXT NOT NULL, "awardId" TEXT NOT NULL, "monthKey" TEXT NOT NULL, "date" TIMESTAMP(3) NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL, "bankAccountId" TEXT, "expenseAccountId" TEXT, "journalEntryId" TEXT,
  "proofOfDepositUrls" JSONB, "emailedAt" TIMESTAMP(3), "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ScholarRelease_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ScholarRelease_awardId_monthKey_key" ON "ScholarRelease"("awardId", "monthKey");
CREATE INDEX IF NOT EXISTS "ScholarRelease_awardId_idx" ON "ScholarRelease"("awardId");
CREATE INDEX IF NOT EXISTS "ScholarRelease_monthKey_idx" ON "ScholarRelease"("monthKey");
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'ScholarRelease_awardId_fkey') THEN
    ALTER TABLE "ScholarRelease" ADD CONSTRAINT "ScholarRelease_awardId_fkey" FOREIGN KEY ("awardId") REFERENCES "ScholarAward"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Local synced cache of HR Platform's Branches Registry (Branches Registry
-- Phase 2). Populated by POST /api/branches/sync.
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
SQL

echo "Redeploy complete."
