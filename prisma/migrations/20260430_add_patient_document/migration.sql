CREATE TYPE "PatientDocType" AS ENUM (PROGRESS_REPORT);

CREATE TABLE "PatientDocument" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "docType" "PatientDocType" NOT NULL DEFAULT PROGRESS_REPORT,
    "branch" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "informedAt" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "paid" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "sentBy" TEXT,
    "uploadedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PatientDocument_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PatientDocument_patientId_idx" ON "PatientDocument"("patientId");
CREATE INDEX "PatientDocument_branch_paid_sentAt_idx" ON "PatientDocument"("branch", "paid", "sentAt");
CREATE INDEX "PatientDocument_createdAt_idx" ON "PatientDocument"("createdAt");

ALTER TABLE "PatientDocument" ADD CONSTRAINT "PatientDocument_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
