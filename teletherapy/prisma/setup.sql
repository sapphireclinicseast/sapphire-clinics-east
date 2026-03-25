-- Teletherapy platform tables
-- Run against the shared sapphire_marketing database

-- Enums for teletherapy
DO $$ BEGIN
  CREATE TYPE "TherapistRole" AS ENUM ('THERAPIST', 'ADMIN');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "SessionNoteStatus" AS ENUM ('COMPLETED', 'DISCONTINUED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- TherapistAccount table
CREATE TABLE IF NOT EXISTS "TherapistAccount" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "staffId" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "role" "TherapistRole" NOT NULL DEFAULT 'THERAPIST',
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "TherapistAccount_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "TherapistAccount_staffId_key" UNIQUE ("staffId"),
  CONSTRAINT "TherapistAccount_email_key" UNIQUE ("email"),
  CONSTRAINT "TherapistAccount_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- SessionNote table
CREATE TABLE IF NOT EXISTS "SessionNote" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "scheduleId" TEXT NOT NULL,
  "therapistAccountId" TEXT NOT NULL,
  "status" "SessionNoteStatus" NOT NULL,
  "notes" TEXT,
  "attachments" JSONB,
  "discontinuedRemarks" TEXT,
  "emailSentAt" TIMESTAMP(3),
  "emailSentTo" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SessionNote_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "SessionNote_scheduleId_key" UNIQUE ("scheduleId"),
  CONSTRAINT "SessionNote_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "SessionNote_therapistAccountId_fkey" FOREIGN KEY ("therapistAccountId") REFERENCES "TherapistAccount"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CaptureToken table
CREATE TABLE IF NOT EXISTS "CaptureToken" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "scheduleId" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CaptureToken_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "CaptureToken_token_key" UNIQUE ("token")
);

-- Add meetLink column to Schedule if it doesn't exist
DO $$ BEGIN
  ALTER TABLE "Schedule" ADD COLUMN "meetLink" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Indexes
CREATE INDEX IF NOT EXISTS "SessionNote_therapistAccountId_idx" ON "SessionNote"("therapistAccountId");
CREATE INDEX IF NOT EXISTS "CaptureToken_scheduleId_idx" ON "CaptureToken"("scheduleId");
