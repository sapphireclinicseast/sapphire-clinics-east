-- ClassPortal: users for class.sapphireclinicseast.org (Phase 1).
-- Stores TEACHER and STUDENT accounts; admin remains hardcoded in the app.

CREATE TYPE "ClassPortalRole" AS ENUM ('STUDENT', 'TEACHER');

CREATE TYPE "ClassPortalLevel" AS ENUM (
  'KINDER', 'GRADE_1', 'GRADE_2', 'GRADE_3', 'GRADE_4', 'GRADE_5',
  'GRADE_6', 'GRADE_7', 'GRADE_8', 'GRADE_9', 'GRADE_10'
);

CREATE TYPE "ClassPortalLrnStatus" AS ENUM ('NO_LRN', 'WITH_LRN', 'RETURNING');

CREATE TABLE "ClassPortalUser" (
  "id"           TEXT PRIMARY KEY,
  "role"         "ClassPortalRole" NOT NULL,
  "email"        TEXT NOT NULL,
  "passwordHash" TEXT NOT NULL,
  "firstName"    TEXT,
  "lastName"     TEXT,
  "level"        "ClassPortalLevel",
  "enrollment"   JSONB,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL
);

-- Uniqueness scoped by role so the same email could theoretically exist as
-- both a teacher and a student (rare but possible — e.g. teacher's own child).
CREATE UNIQUE INDEX "ClassPortalUser_role_email_key" ON "ClassPortalUser"("role", "email");
CREATE INDEX "ClassPortalUser_role_idx" ON "ClassPortalUser"("role");
