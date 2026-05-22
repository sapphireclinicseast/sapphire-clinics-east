-- Phase 1: Class section. Teacher-owned roster + weekly schedule + cover
-- photo. Later phases (lessons, tests, projects, activities) add their
-- own tables that reference ClassPortalClass.id.
CREATE TABLE IF NOT EXISTS "ClassPortalClass" (
    "id"                TEXT NOT NULL,
    "branch"            "ClassPortalBranch" NOT NULL,
    "level"             "ClassPortalLevel"  NOT NULL,
    "name"              TEXT NOT NULL,
    "section"           TEXT,
    "teacherId"         TEXT NOT NULL,
    "studentIds"        TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleDays"      TEXT[] DEFAULT ARRAY[]::TEXT[],
    "scheduleStartTime" TEXT,
    "scheduleEndTime"   TEXT,
    "photoFileName"     TEXT,
    "photoFileType"     TEXT,
    "photoFileSize"     INTEGER,
    "photoFileData"     BYTEA,
    "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"         TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalClass_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClassPortalClass_branch_idx"    ON "ClassPortalClass"("branch");
CREATE INDEX IF NOT EXISTS "ClassPortalClass_teacherId_idx" ON "ClassPortalClass"("teacherId");
CREATE INDEX IF NOT EXISTS "ClassPortalClass_level_idx"     ON "ClassPortalClass"("level");
