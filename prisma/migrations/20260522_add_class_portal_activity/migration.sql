-- Phase 4: Class activities (school events / field trips / IEP reviews
-- / holidays) with a photo gallery.
CREATE TABLE IF NOT EXISTS "ClassPortalActivity" (
    "id"          TEXT NOT NULL,
    "classId"     TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "type"        TEXT,
    "description" TEXT,
    "fromDate"    TIMESTAMP(3),
    "toDate"      TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalActivity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClassPortalActivity_classId_idx" ON "ClassPortalActivity"("classId");

CREATE TABLE IF NOT EXISTS "ClassPortalActivityPhoto" (
    "id"         TEXT NOT NULL,
    "activityId" TEXT NOT NULL,
    "fileName"   TEXT NOT NULL,
    "fileType"   TEXT NOT NULL,
    "fileSize"   INTEGER NOT NULL,
    "fileData"   BYTEA NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassPortalActivityPhoto_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ClassPortalActivityPhoto_activityId_idx" ON "ClassPortalActivityPhoto"("activityId");
