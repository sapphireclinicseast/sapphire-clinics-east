-- Add PWD ID photo URL to Patient
ALTER TABLE "Patient" ADD COLUMN "pwdIdUrl" TEXT;

-- Create PwdIdUploadToken table for QR-based mobile uploads
CREATE TABLE "PwdIdUploadToken" (
  "id"        TEXT NOT NULL,
  "token"     TEXT NOT NULL,
  "patientId" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "used"      BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "PwdIdUploadToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PwdIdUploadToken_token_key" ON "PwdIdUploadToken"("token");

ALTER TABLE "PwdIdUploadToken"
  ADD CONSTRAINT "PwdIdUploadToken_patientId_fkey"
  FOREIGN KEY ("patientId") REFERENCES "Patient"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
