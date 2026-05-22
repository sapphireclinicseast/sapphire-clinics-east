-- Server-backed curriculum + template libraries so uploads on one device
-- are visible to every other user (admin, branch admin, teacher, front
-- desk, student). Replaces the localStorage-only storage that left
-- teachers with empty libraries when only the admin had uploaded.
CREATE TABLE IF NOT EXISTS "ClassPortalCurriculum" (
    "id"          TEXT NOT NULL,
    "level"       TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "pdfFileName" TEXT,
    "pdfFileType" TEXT,
    "pdfFileSize" INTEGER,
    "pdfFileData" BYTEA,
    "docFileName" TEXT,
    "docFileType" TEXT,
    "docFileSize" INTEGER,
    "docFileData" BYTEA,
    "xlsFileName" TEXT,
    "xlsFileType" TEXT,
    "xlsFileSize" INTEGER,
    "xlsFileData" BYTEA,
    "uploadedBy"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalCurriculum_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClassPortalCurriculum_level_idx"
    ON "ClassPortalCurriculum"("level");

CREATE TABLE IF NOT EXISTS "ClassPortalTemplate" (
    "id"          TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "pdfFileName" TEXT,
    "pdfFileType" TEXT,
    "pdfFileSize" INTEGER,
    "pdfFileData" BYTEA,
    "docFileName" TEXT,
    "docFileType" TEXT,
    "docFileSize" INTEGER,
    "docFileData" BYTEA,
    "uploadedBy"  TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalTemplate_pkey" PRIMARY KEY ("id")
);
