-- ClassPortal: add clinic-branch awareness to enrollment + teacher assignments.

CREATE TYPE "ClassPortalBranch" AS ENUM ('EAST', 'GREENHILLS');

ALTER TABLE "ClassPortalUser" ADD COLUMN "branch" "ClassPortalBranch";
CREATE INDEX "ClassPortalUser_branch_idx" ON "ClassPortalUser"("branch");

-- One row per (teacher, branch, level) assignment.
CREATE TABLE "ClassPortalTeacherAssignment" (
  "id"        TEXT PRIMARY KEY,
  "teacherId" TEXT NOT NULL,
  "branch"    "ClassPortalBranch" NOT NULL,
  "level"     "ClassPortalLevel"  NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX "ClassPortalTeacherAssignment_teacherId_branch_level_key"
  ON "ClassPortalTeacherAssignment"("teacherId", "branch", "level");
CREATE INDEX "ClassPortalTeacherAssignment_branch_idx"    ON "ClassPortalTeacherAssignment"("branch");
CREATE INDEX "ClassPortalTeacherAssignment_teacherId_idx" ON "ClassPortalTeacherAssignment"("teacherId");
