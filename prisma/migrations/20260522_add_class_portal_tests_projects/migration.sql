-- Phase 3: tests/exams (per-lesson) + projects (per-class).
CREATE TABLE IF NOT EXISTS "ClassPortalLessonTest" (
    "id"          TEXT NOT NULL,
    "lessonId"    TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "totalPoints" INTEGER NOT NULL,
    "scores"      JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalLessonTest_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClassPortalLessonTest_lessonId_idx" ON "ClassPortalLessonTest"("lessonId");

CREATE TABLE IF NOT EXISTS "ClassPortalLessonTestProof" (
    "id"        TEXT NOT NULL,
    "testId"    TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fileName"  TEXT NOT NULL,
    "fileType"  TEXT NOT NULL,
    "fileSize"  INTEGER NOT NULL,
    "fileData"  BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalLessonTestProof_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalLessonTestProof_testId_studentId_key"
    ON "ClassPortalLessonTestProof"("testId", "studentId");
CREATE INDEX IF NOT EXISTS "ClassPortalLessonTestProof_testId_idx" ON "ClassPortalLessonTestProof"("testId");

CREATE TABLE IF NOT EXISTS "ClassPortalProject" (
    "id"          TEXT NOT NULL,
    "classId"     TEXT NOT NULL,
    "title"       TEXT NOT NULL,
    "description" TEXT,
    "deadline"    TIMESTAMP(3),
    "totalScore"  INTEGER NOT NULL,
    "grades"      JSONB NOT NULL DEFAULT '{}',
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalProject_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClassPortalProject_classId_idx" ON "ClassPortalProject"("classId");

CREATE TABLE IF NOT EXISTS "ClassPortalProjectProof" (
    "id"        TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "studentId" TEXT NOT NULL,
    "fileName"  TEXT NOT NULL,
    "fileType"  TEXT NOT NULL,
    "fileSize"  INTEGER NOT NULL,
    "fileData"  BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalProjectProof_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalProjectProof_projectId_studentId_key"
    ON "ClassPortalProjectProof"("projectId", "studentId");
CREATE INDEX IF NOT EXISTS "ClassPortalProjectProof_projectId_idx" ON "ClassPortalProjectProof"("projectId");
