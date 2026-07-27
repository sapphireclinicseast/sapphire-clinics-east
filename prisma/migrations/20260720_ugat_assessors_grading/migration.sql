-- Assessor assignments (per academic year, with weight), the editable grading
-- rubric, and per-assessor per-applicant assessments. Additive + idempotent.

CREATE TABLE IF NOT EXISTS "UgatAssessor" (
  "id" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "weightPercent" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatAssessor_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatAssessor_adminId_academicYear_key" ON "UgatAssessor"("adminId", "academicYear");
CREATE INDEX IF NOT EXISTS "UgatAssessor_academicYear_idx" ON "UgatAssessor"("academicYear");

CREATE TABLE IF NOT EXISTS "UgatRubric" (
  "id" TEXT NOT NULL,
  "key" TEXT NOT NULL DEFAULT 'default',
  "config" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatRubric_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatRubric_key_key" ON "UgatRubric"("key");

CREATE TABLE IF NOT EXISTS "UgatAssessment" (
  "id" TEXT NOT NULL,
  "scholarId" TEXT NOT NULL,
  "adminId" TEXT NOT NULL,
  "academicYear" TEXT NOT NULL,
  "stage" TEXT NOT NULL,
  "data" JSONB NOT NULL,
  "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UgatAssessment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "UgatAssessment_scholarId_adminId_stage_key" ON "UgatAssessment"("scholarId", "adminId", "stage");
CREATE INDEX IF NOT EXISTS "UgatAssessment_scholarId_stage_idx" ON "UgatAssessment"("scholarId", "stage");
CREATE INDEX IF NOT EXISTS "UgatAssessment_academicYear_stage_idx" ON "UgatAssessment"("academicYear", "stage");
