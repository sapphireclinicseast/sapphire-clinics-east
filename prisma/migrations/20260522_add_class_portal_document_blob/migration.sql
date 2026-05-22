-- ClassPortal: permanent server-side storage for parent-uploaded
-- enrollment documents (PSA, Report Card SF9, PWD ID, Affidavit, etc.)
-- so the partner-school /admission view can download them.
CREATE TABLE IF NOT EXISTS "ClassPortalDocumentBlob" (
    "id" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "docKey" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "fileData" BYTEA NOT NULL,
    "uploadedBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalDocumentBlob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalDocumentBlob_studentId_docKey_key"
    ON "ClassPortalDocumentBlob"("studentId", "docKey");
CREATE INDEX IF NOT EXISTS "ClassPortalDocumentBlob_studentId_idx"
    ON "ClassPortalDocumentBlob"("studentId");
