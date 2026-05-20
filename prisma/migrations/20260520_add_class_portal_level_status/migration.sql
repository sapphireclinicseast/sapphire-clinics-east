-- ClassPortal: per-grade-level enabled/disabled flag, admin-controlled.
-- Disabling a level only affects NEW enrollments; existing students stay on the level.

CREATE TABLE "ClassPortalLevelStatus" (
  "level"     "ClassPortalLevel" PRIMARY KEY,
  "enabled"   BOOLEAN NOT NULL DEFAULT true,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedBy" TEXT
);
