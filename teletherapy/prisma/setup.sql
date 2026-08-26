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
  "resetToken" TEXT,
  "resetTokenExpiry" TIMESTAMP(3),
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

-- PatientAssignment enum
DO $$ BEGIN
  CREATE TYPE "PatientAssignmentStatus" AS ENUM ('ACTIVE', 'ENDORSED', 'DISCHARGED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- PatientAssignment table
CREATE TABLE IF NOT EXISTS "PatientAssignment" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "patientId" TEXT NOT NULL,
  "therapistAccountId" TEXT NOT NULL,
  "status" "PatientAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
  "endorsedToId" TEXT,
  "dischargeRemarks" TEXT,
  "endorsedAt" TIMESTAMP(3),
  "dischargedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PatientAssignment_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "PatientAssignment_unique" UNIQUE ("patientId", "therapistAccountId", "status"),
  CONSTRAINT "PatientAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientAssignment_therapistAccountId_fkey" FOREIGN KEY ("therapistAccountId") REFERENCES "TherapistAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "PatientAssignment_endorsedToId_fkey" FOREIGN KEY ("endorsedToId") REFERENCES "TherapistAccount"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "PatientAssignment_patientId_idx" ON "PatientAssignment"("patientId");
CREATE INDEX IF NOT EXISTS "PatientAssignment_therapistAccountId_idx" ON "PatientAssignment"("therapistAccountId");

-- ClinicianSettings table (Lic No, PTR No, Signature)
CREATE TABLE IF NOT EXISTS "ClinicianSettings" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "therapistAccountId" TEXT NOT NULL,
  "licenseNo" TEXT,
  "ptrNo" TEXT,
  "signatureDataUrl" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClinicianSettings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ClinicianSettings_therapistAccountId_key" UNIQUE ("therapistAccountId"),
  CONSTRAINT "ClinicianSettings_therapistAccountId_fkey" FOREIGN KEY ("therapistAccountId") REFERENCES "TherapistAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Add meetLink column to Schedule if it doesn't exist
DO $$ BEGIN
  ALTER TABLE "Schedule" ADD COLUMN "meetLink" TEXT;
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS "SessionNote_therapistAccountId_idx" ON "SessionNote"("therapistAccountId");
CREATE INDEX IF NOT EXISTS "CaptureToken_scheduleId_idx" ON "CaptureToken"("scheduleId");
CREATE INDEX IF NOT EXISTS "Schedule_staffId_idx" ON "Schedule"("staffId");
CREATE INDEX IF NOT EXISTS "Schedule_patientId_idx" ON "Schedule"("patientId");
CREATE INDEX IF NOT EXISTS "Schedule_date_idx" ON "Schedule"("date");
CREATE INDEX IF NOT EXISTS "Schedule_status_idx" ON "Schedule"("status");
CREATE INDEX IF NOT EXISTS "Schedule_staffId_date_idx" ON "Schedule"("staffId", "date");
CREATE INDEX IF NOT EXISTS "Schedule_patientId_status_idx" ON "Schedule"("patientId", "status");

-- ── Support Tickets (staff concerns about the portal) ──
CREATE TABLE IF NOT EXISTS "Ticket" (
  "id" TEXT PRIMARY KEY,
  "ticketNumber" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "subject" TEXT NOT NULL,
  "description" TEXT NOT NULL,
  "attachmentPath" TEXT,
  "attachmentName" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "raisedByAccountId" TEXT NOT NULL,
  "raisedByName" TEXT NOT NULL,
  "raisedByEmail" TEXT,
  "resolution" TEXT,
  "resolvedByName" TEXT,
  "resolvedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Ticket_ticketNumber_key" ON "Ticket"("ticketNumber");
CREATE INDEX IF NOT EXISTS "Ticket_raisedByAccountId_idx" ON "Ticket"("raisedByAccountId");
CREATE INDEX IF NOT EXISTS "Ticket_status_idx" ON "Ticket"("status");

-- Session note edit history (intern author + supervisor edits, with timestamps)
ALTER TABLE "SessionNote" ADD COLUMN IF NOT EXISTS "editHistory" JSONB;

-- ── Intern Supervision: Balik-Tanaw (weekly intern reflections) ──
CREATE TABLE IF NOT EXISTS "BalikTanaw" (
  "id" TEXT PRIMARY KEY,
  "internStaffId" TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "periodLabel" TEXT NOT NULL,
  "answers" JSONB NOT NULL,
  "internSignedName" TEXT NOT NULL,
  "internSignedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "supervisorSignedName" TEXT,
  "supervisorSignedAt" TIMESTAMP(3),
  "supervisorSignatureUrl" TEXT,
  "supervisorAccountId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "BalikTanaw_internStaffId_idx" ON "BalikTanaw"("internStaffId");

-- ── Intern Supervision: Grades (one grade + computation file per intern) ──
CREATE TABLE IF NOT EXISTS "InternGrade" (
  "id" TEXT PRIMARY KEY,
  "internStaffId" TEXT NOT NULL,
  "supervisorAccountId" TEXT NOT NULL,
  "grade" TEXT NOT NULL,
  "note" TEXT,
  "fileName" TEXT,
  "filePath" TEXT,
  "mimeType" TEXT,
  "gradedByName" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "InternGrade_internStaffId_supervisorAccountId_key" ON "InternGrade"("internStaffId", "supervisorAccountId");
CREATE INDEX IF NOT EXISTS "InternGrade_internStaffId_idx" ON "InternGrade"("internStaffId");

-- ── Intern Learning Outcomes & Preferences (one per intern, editable) ──
CREATE TABLE IF NOT EXISTS "LearningProfile" (
  "id" TEXT PRIMARY KEY,
  "internStaffId" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "LearningProfile_internStaffId_key" ON "LearningProfile"("internStaffId");

-- ── Internship documents (supervisor uploads, department-scoped) ──
CREATE TABLE IF NOT EXISTS "InternshipDocument" (
  "id" TEXT PRIMARY KEY,
  "department" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "description" TEXT,
  "fileName" TEXT NOT NULL,
  "filePath" TEXT NOT NULL,
  "mimeType" TEXT,
  "uploadedByAccountId" TEXT NOT NULL,
  "uploadedByName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "InternshipDocument_department_idx" ON "InternshipDocument"("department");
CREATE INDEX IF NOT EXISTS "InternshipDocument_createdAt_idx" ON "InternshipDocument"("createdAt");

-- Intern auto-disable: manual re-enable overrides the daily sweep
ALTER TABLE "TherapistAccount" ADD COLUMN IF NOT EXISTS "internAccessOverride" BOOLEAN NOT NULL DEFAULT false;

-- Fallback staff photo (URL or data URI) for interns without an HR photo
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "photoPath" TEXT;

-- Notification bell read cursor (see schema.prisma NotificationSeen)
CREATE TABLE IF NOT EXISTS "NotificationSeen" (
  "accountId" TEXT PRIMARY KEY,
  "seenKeys"  TEXT[] NOT NULL DEFAULT '{}',
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
