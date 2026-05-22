-- ClassPortal: one-time QR-from-phone upload tokens.
CREATE TABLE IF NOT EXISTS "ClassPortalUploadToken" (
    "token" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "fileData" BYTEA,
    "uploadedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassPortalUploadToken_pkey" PRIMARY KEY ("token")
);

CREATE INDEX IF NOT EXISTS "ClassPortalUploadToken_expiresAt_idx" ON "ClassPortalUploadToken"("expiresAt");
CREATE INDEX IF NOT EXISTS "ClassPortalUploadToken_studentId_idx" ON "ClassPortalUploadToken"("studentId");
