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

DO $$ BEGIN
  CREATE TYPE "RevenueType" AS ENUM ('EARNED', 'UNEARNED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "Service" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "branch" "ServiceBranch" NOT NULL,
  "price" DECIMAL NOT NULL,
  "priceType" "PriceType" NOT NULL DEFAULT 'FIXED',
  "revenueType" "RevenueType" NOT NULL DEFAULT 'EARNED',
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

-- Add revenueType column (idempotent for existing installations)
DO $$ BEGIN
  ALTER TABLE "Service" ADD COLUMN "revenueType" "RevenueType" NOT NULL DEFAULT 'EARNED';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

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

-- ── POS System ─────────────────────────────────────────────

-- Add new role values
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SBEA_FRONTDESK';
  ALTER TYPE "Role" ADD VALUE IF NOT EXISTS 'SBGH_FRONTDESK';
EXCEPTION WHEN others THEN NULL;
END $$;

-- POS Enums
DO $$ BEGIN CREATE TYPE "OrderType" AS ENUM ('SERVICE', 'PRODUCT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OrderStatus" AS ENUM ('COMPLETED', 'REOPENED', 'VOIDED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'GCASH', 'PAYMAYA', 'DEBIT', 'CREDIT_CARD', 'VIP_CARD', 'PREPAID_CARD', 'REWARD_POINTS', 'SHOPEE', 'LAZADA', 'TIKTOK', 'DOWNPAYMENT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "DiscountType" AS ENUM ('NONE', 'PWD_SC', 'CUSTOM'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WalletAction" AS ENUM ('DEDUCTION', 'RELOAD', 'REWARD_EARN', 'REWARD_SPEND'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WalletType" AS ENUM ('PACKAGE', 'VIP', 'PREPAID_CARD', 'DOWNPAYMENT', 'ADVANCE'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Referrer table
CREATE TABLE IF NOT EXISTS "Referrer" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "affiliation" TEXT,
  "specialization" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Referrer_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Referrer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Referrer_isActive_idx" ON "Referrer"("isActive");
CREATE INDEX IF NOT EXISTS "Referrer_createdById_idx" ON "Referrer"("createdById");

-- DigitalWallet table
CREATE TABLE IF NOT EXISTS "DigitalWallet" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "patientId" TEXT NOT NULL,
  "patientName" TEXT NOT NULL,
  "patientEmail" TEXT,
  "barcode" TEXT NOT NULL,
  "walletType" "WalletType" NOT NULL,
  "balance" DECIMAL NOT NULL DEFAULT 0,
  "rewardPoints" INTEGER NOT NULL DEFAULT 0,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DigitalWallet_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "DigitalWallet_barcode_key" ON "DigitalWallet"("barcode");
CREATE UNIQUE INDEX IF NOT EXISTS "DigitalWallet_patientId_walletType_key" ON "DigitalWallet"("patientId", "walletType");
CREATE INDEX IF NOT EXISTS "DigitalWallet_patientName_idx" ON "DigitalWallet"("patientName");
CREATE INDEX IF NOT EXISTS "DigitalWallet_walletType_idx" ON "DigitalWallet"("walletType");

-- WalletPackage table
CREATE TABLE IF NOT EXISTS "WalletPackage" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "walletId" TEXT NOT NULL,
  "serviceName" TEXT NOT NULL,
  "serviceId" TEXT,
  "totalSessions" INTEGER NOT NULL,
  "usedSessions" INTEGER NOT NULL DEFAULT 0,
  "amountPaid" DECIMAL NOT NULL,
  "purchaseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3),
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletPackage_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletPackage_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "DigitalWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WalletPackage_walletId_idx" ON "WalletPackage"("walletId");
CREATE INDEX IF NOT EXISTS "WalletPackage_serviceId_idx" ON "WalletPackage"("serviceId");
CREATE INDEX IF NOT EXISTS "WalletPackage_isActive_idx" ON "WalletPackage"("isActive");

-- WalletLog table
CREATE TABLE IF NOT EXISTS "WalletLog" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "walletId" TEXT NOT NULL,
  "packageId" TEXT,
  "action" "WalletAction" NOT NULL,
  "description" TEXT NOT NULL DEFAULT '',
  "sessions" INTEGER,
  "pointsChange" INTEGER,
  "balanceBefore" INTEGER,
  "balanceAfter" INTEGER,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WalletLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "WalletLog_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "DigitalWallet"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "WalletLog_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "WalletPackage"("id") ON UPDATE CASCADE,
  CONSTRAINT "WalletLog_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "WalletLog_walletId_idx" ON "WalletLog"("walletId");
CREATE INDEX IF NOT EXISTS "WalletLog_packageId_idx" ON "WalletLog"("packageId");
CREATE INDEX IF NOT EXISTS "WalletLog_createdAt_idx" ON "WalletLog"("createdAt");

-- Order number sequence
CREATE SEQUENCE IF NOT EXISTS "order_number_seq" START WITH 1001;

-- Order table
CREATE TABLE IF NOT EXISTS "Order" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderNumber" INTEGER NOT NULL DEFAULT nextval('order_number_seq'),
  "orderType" "OrderType" NOT NULL,
  "branch" TEXT NOT NULL,
  "patientId" TEXT,
  "patientName" TEXT,
  "clinicianName" TEXT,
  "subtotal" DECIMAL NOT NULL,
  "discountAmount" DECIMAL NOT NULL DEFAULT 0,
  "discountType" "DiscountType" NOT NULL DEFAULT 'NONE',
  "discountLabel" TEXT,
  "netAmount" DECIMAL NOT NULL,
  "revenueType" TEXT NOT NULL DEFAULT 'EARNED',
  "referrerId" TEXT,
  "notes" TEXT,
  "status" "OrderStatus" NOT NULL DEFAULT 'COMPLETED',
  "transactionDate" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Order_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Order_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Referrer"("id") ON UPDATE CASCADE,
  CONSTRAINT "Order_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE INDEX IF NOT EXISTS "Order_orderType_idx" ON "Order"("orderType");
CREATE INDEX IF NOT EXISTS "Order_branch_idx" ON "Order"("branch");
CREATE INDEX IF NOT EXISTS "Order_status_idx" ON "Order"("status");
CREATE INDEX IF NOT EXISTS "Order_transactionDate_idx" ON "Order"("transactionDate");
CREATE INDEX IF NOT EXISTS "Order_createdById_idx" ON "Order"("createdById");
CREATE INDEX IF NOT EXISTS "Order_referrerId_idx" ON "Order"("referrerId");

-- OrderItem table
CREATE TABLE IF NOT EXISTS "OrderItem" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId" TEXT NOT NULL,
  "serviceId" TEXT,
  "inventoryItemId" TEXT,
  "name" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL DEFAULT 1,
  "unitPrice" DECIMAL NOT NULL,
  "lineTotal" DECIMAL NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderItem_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderItem_serviceId_fkey" FOREIGN KEY ("serviceId") REFERENCES "Service"("id") ON UPDATE CASCADE,
  CONSTRAINT "OrderItem_inventoryItemId_fkey" FOREIGN KEY ("inventoryItemId") REFERENCES "InventoryItem"("id") ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX IF NOT EXISTS "OrderItem_serviceId_idx" ON "OrderItem"("serviceId");
CREATE INDEX IF NOT EXISTS "OrderItem_inventoryItemId_idx" ON "OrderItem"("inventoryItemId");

-- OrderPayment table
CREATE TABLE IF NOT EXISTS "OrderPayment" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "orderId" TEXT NOT NULL,
  "method" "PaymentMethod" NOT NULL,
  "amount" DECIMAL NOT NULL,
  "walletId" TEXT,
  "reference" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "OrderPayment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "OrderPayment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "OrderPayment_walletId_fkey" FOREIGN KEY ("walletId") REFERENCES "DigitalWallet"("id") ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "OrderPayment_orderId_idx" ON "OrderPayment"("orderId");
CREATE INDEX IF NOT EXISTS "OrderPayment_method_idx" ON "OrderPayment"("method");
CREATE INDEX IF NOT EXISTS "OrderPayment_walletId_idx" ON "OrderPayment"("walletId");

-- DiscountSetting table
CREATE TABLE IF NOT EXISTS "DiscountSetting" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "name" TEXT NOT NULL,
  "type" TEXT NOT NULL DEFAULT 'PERCENTAGE',
  "value" DECIMAL NOT NULL,
  "branch" TEXT,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "createdById" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DiscountSetting_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "DiscountSetting_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "DiscountSetting_isActive_idx" ON "DiscountSetting"("isActive");
CREATE INDEX IF NOT EXISTS "DiscountSetting_branch_idx" ON "DiscountSetting"("branch");
