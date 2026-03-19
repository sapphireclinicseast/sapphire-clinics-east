-- SAPPHIRE Accounting Hub — Database Schema
-- Run this on the accounting_db container after first startup

-- Enums
DO $$ BEGIN
  CREATE TYPE "Role" AS ENUM ('ADMIN', 'ACCOUNTANT', 'VIEWER', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "Branch" AS ENUM ('SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- User table
CREATE TABLE IF NOT EXISTS "User" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "Role" NOT NULL DEFAULT 'VIEWER',
  "branch" "Branch",
  "avatar" TEXT,
  "resetToken" TEXT,
  "resetTokenExpiry" TIMESTAMP(3),
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_email_idx" ON "User"("email");
CREATE INDEX IF NOT EXISTS "User_role_idx" ON "User"("role");

-- AuditLog table
CREATE TABLE IF NOT EXISTS "AuditLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "userId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entity" TEXT NOT NULL,
  "entityId" TEXT,
  "details" JSONB,
  "ipAddress" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX IF NOT EXISTS "AuditLog_entity_entityId_idx" ON "AuditLog"("entity", "entityId");
CREATE INDEX IF NOT EXISTS "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- Seed admin user (password: SCEIAccounting2026!)
INSERT INTO "User" ("id", "name", "email", "passwordHash", "role", "createdAt", "updatedAt")
VALUES (
  'cldefaultadmin001',
  'System Admin',
  'admin@sapphireclinicseast.org',
  '$2b$12$dpcgc.4mLAFMQbFIM0d0L.yU4GhzI02kUiPEUyrhJng5/8eLE/vMa',
  'ADMIN',
  NOW(),
  NOW()
) ON CONFLICT ("email") DO NOTHING;

-- ── Chart of Accounts ──────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "NormalBalance" AS ENUM ('DEBIT', 'CREDIT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Account" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "accountNumber" TEXT NOT NULL,
  "accountTitle" TEXT NOT NULL,
  "accountType" "AccountType" NOT NULL,
  "normalBalance" "NormalBalance" NOT NULL,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Account_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Account_accountNumber_key" ON "Account"("accountNumber");
CREATE INDEX IF NOT EXISTS "Account_accountType_idx" ON "Account"("accountType");
CREATE INDEX IF NOT EXISTS "Account_isActive_idx" ON "Account"("isActive");
CREATE INDEX IF NOT EXISTS "Account_createdById_idx" ON "Account"("createdById");

-- Add subType column (idempotent for existing installations)
DO $$ BEGIN
  ALTER TABLE "Account" ADD COLUMN "subType" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- ── Services ───────────────────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "ServiceBranch" AS ENUM ('SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'ALL');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "PriceType" AS ENUM ('FIXED', 'ADJUSTABLE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Service" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "branch" "ServiceBranch" NOT NULL,
  "price" DECIMAL NOT NULL,
  "priceType" "PriceType" NOT NULL DEFAULT 'FIXED',
  "hasDoctorFee" BOOLEAN NOT NULL DEFAULT false,
  "doctorFee" DECIMAL,
  "clinicFee" DECIMAL,
  "pwdDiscountClinicOnly" BOOLEAN NOT NULL DEFAULT false,
  "description" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Service_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Service_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Service_department_idx" ON "Service"("department");
CREATE INDEX IF NOT EXISTS "Service_branch_idx" ON "Service"("branch");
CREATE INDEX IF NOT EXISTS "Service_isActive_idx" ON "Service"("isActive");
CREATE INDEX IF NOT EXISTS "Service_createdById_idx" ON "Service"("createdById");

-- ── Inventory & Procurement ────────────────────────────────

DO $$ BEGIN
  CREATE TYPE "AdjustmentType" AS ENUM ('SHRINKAGE', 'INCREASE');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'APPROVED', 'SHIPPED', 'RECEIVED', 'RETURNED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Supplier table
CREATE TABLE IF NOT EXISTS "Supplier" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "supplierName" TEXT NOT NULL,
  "email" TEXT,
  "contactNumber" TEXT,
  "isForeign" BOOLEAN NOT NULL DEFAULT false,
  "currency" TEXT NOT NULL DEFAULT 'PHP',
  "defaultExchangeRate" DECIMAL,
  "address" TEXT,
  "notes" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Supplier_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Supplier_isActive_idx" ON "Supplier"("isActive");
CREATE INDEX IF NOT EXISTS "Supplier_createdById_idx" ON "Supplier"("createdById");

-- InventoryItem table
CREATE TABLE IF NOT EXISTS "InventoryItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "sku" TEXT NOT NULL,
  "skuDepartment" TEXT NOT NULL,
  "skuCategory" TEXT NOT NULL,
  "skuSubcategory" TEXT NOT NULL,
  "skuSequence" INTEGER NOT NULL,
  "barcode" TEXT,
  "branch" "Branch" NOT NULL,
  "accountSubType" TEXT,
  "unitCost" DECIMAL NOT NULL DEFAULT 0,
  "sellingPrice" DECIMAL,
  "quantity" INTEGER NOT NULL DEFAULT 0,
  "reorderLevel" INTEGER,
  "supplierId" TEXT,
  "supplierExchangeRate" DECIMAL,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryItem_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON UPDATE CASCADE,
  CONSTRAINT "InventoryItem_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "InventoryItem_sku_key" ON "InventoryItem"("sku");
CREATE INDEX IF NOT EXISTS "InventoryItem_branch_idx" ON "InventoryItem"("branch");
CREATE INDEX IF NOT EXISTS "InventoryItem_skuDepartment_idx" ON "InventoryItem"("skuDepartment");
CREATE INDEX IF NOT EXISTS "InventoryItem_supplierId_idx" ON "InventoryItem"("supplierId");
CREATE INDEX IF NOT EXISTS "InventoryItem_isActive_idx" ON "InventoryItem"("isActive");
CREATE INDEX IF NOT EXISTS "InventoryItem_createdById_idx" ON "InventoryItem"("createdById");

-- InventoryAdjustment table
CREATE TABLE IF NOT EXISTS "InventoryAdjustment" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "itemId" TEXT NOT NULL,
  "type" "AdjustmentType" NOT NULL,
  "quantityChange" INTEGER NOT NULL,
  "previousQuantity" INTEGER NOT NULL,
  "newQuantity" INTEGER NOT NULL,
  "adjustmentDate" TIMESTAMP(3) NOT NULL,
  "remarks" TEXT NOT NULL,
  "adjustedById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "InventoryAdjustment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "InventoryAdjustment_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "InventoryAdjustment_adjustedById_fkey" FOREIGN KEY ("adjustedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "InventoryAdjustment_itemId_idx" ON "InventoryAdjustment"("itemId");
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_adjustedById_idx" ON "InventoryAdjustment"("adjustedById");
CREATE INDEX IF NOT EXISTS "InventoryAdjustment_adjustmentDate_idx" ON "InventoryAdjustment"("adjustmentDate");

-- ConsignmentTransfer table
CREATE TABLE IF NOT EXISTS "ConsignmentTransfer" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "itemId" TEXT NOT NULL,
  "fromBranch" "Branch" NOT NULL,
  "toBranch" "Branch" NOT NULL,
  "quantity" INTEGER NOT NULL,
  "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
  "requestedById" TEXT NOT NULL,
  "approvedById" TEXT,
  "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "approvedAt" TIMESTAMP(3),
  "shippedAt" TIMESTAMP(3),
  "receivedAt" TIMESTAMP(3),
  "remarks" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ConsignmentTransfer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ConsignmentTransfer_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "InventoryItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentTransfer_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ConsignmentTransfer_approvedById_fkey" FOREIGN KEY ("approvedById") REFERENCES "User"("id") ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ConsignmentTransfer_itemId_idx" ON "ConsignmentTransfer"("itemId");
CREATE INDEX IF NOT EXISTS "ConsignmentTransfer_status_idx" ON "ConsignmentTransfer"("status");
CREATE INDEX IF NOT EXISTS "ConsignmentTransfer_fromBranch_idx" ON "ConsignmentTransfer"("fromBranch");
CREATE INDEX IF NOT EXISTS "ConsignmentTransfer_toBranch_idx" ON "ConsignmentTransfer"("toBranch");
CREATE INDEX IF NOT EXISTS "ConsignmentTransfer_requestedById_idx" ON "ConsignmentTransfer"("requestedById");
