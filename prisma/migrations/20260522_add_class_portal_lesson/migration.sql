-- Phase 2: lessons + attendance + outputs + grades inside a class.
CREATE TABLE IF NOT EXISTS "ClassPortalLesson" (
    "id"               TEXT NOT NULL,
    "classId"          TEXT NOT NULL,
    "lessonDate"       TIMESTAMP(3) NOT NULL,
    "title"            TEXT NOT NULL,
    "description"      TEXT,
    "attendance"       JSONB NOT NULL DEFAULT '{}',
    "hasStudentOutput" BOOLEAN NOT NULL DEFAULT false,
    "gradeTotal"       INTEGER,
    "grades"           JSONB NOT NULL DEFAULT '{}',
    "createdAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"        TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalLesson_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClassPortalLesson_classId_idx"    ON "ClassPortalLesson"("classId");
CREATE INDEX IF NOT EXISTS "ClassPortalLesson_lessonDate_idx" ON "ClassPortalLesson"("lessonDate");

CREATE TABLE IF NOT EXISTS "ClassPortalLessonAttachment" (
    "id"        TEXT NOT NULL,
    "lessonId"  TEXT NOT NULL,
    "fileName"  TEXT NOT NULL,
    "fileType"  TEXT NOT NULL,
    "fileSize"  INTEGER NOT NULL,
    "fileData"  BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassPortalLessonAttachment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClassPortalLessonAttachment_lessonId_idx" ON "ClassPortalLessonAttachment"("lessonId");

CREATE TABLE IF NOT EXISTS "ClassPortalLessonOutput" (
    "id"         TEXT NOT NULL,
    "lessonId"   TEXT NOT NULL,
    "studentId"  TEXT NOT NULL,
    "fileName"   TEXT NOT NULL,
    "fileType"   TEXT NOT NULL,
    "fileSize"   INTEGER NOT NULL,
    "fileData"   BYTEA NOT NULL,
    "makeupDate" TIMESTAMP(3),
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"  TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalLessonOutput_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalLessonOutput_lessonId_studentId_key"
    ON "ClassPortalLessonOutput"("lessonId", "studentId");
CREATE INDEX IF NOT EXISTS "ClassPortalLessonOutput_lessonId_idx"
    ON "ClassPortalLessonOutput"("lessonId");
