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
