-- CreateEnum
CREATE TYPE "SurveyType" AS ENUM ('HR10', 'HR11', 'HR12', 'HR16');

-- CreateEnum
CREATE TYPE "SurveyStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "SurveyAssignment" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "scheduleId" TEXT,
    "patientId" TEXT,
    "surveyType" "SurveyType" NOT NULL,
    "patientName" TEXT,
    "patientAge" INTEGER,
    "branch" TEXT NOT NULL,
    "sessionType" TEXT,
    "status" "SurveyStatus" NOT NULL DEFAULT 'PENDING',
    "assignedBy" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SurveyResponse" (
    "id" TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "surveyType" "SurveyType" NOT NULL,
    "branch" TEXT NOT NULL,
    "respondentName" TEXT,
    "respondentEmail" TEXT,
    "respondentPhone" TEXT,
    "responsesJson" JSONB NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SurveyResponse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AssessmentTarget" (
    "id" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "targetCount" INTEGER NOT NULL,
    "completed" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "AssessmentTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SurveyResponse_assignmentId_key" ON "SurveyResponse"("assignmentId");

-- CreateIndex
CREATE UNIQUE INDEX "AssessmentTarget_staffId_year_key" ON "AssessmentTarget"("staffId", "year");

-- AddForeignKey
ALTER TABLE "SurveyAssignment" ADD CONSTRAINT "SurveyAssignment_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAssignment" ADD CONSTRAINT "SurveyAssignment_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "Schedule"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyAssignment" ADD CONSTRAINT "SurveyAssignment_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_assignmentId_fkey" FOREIGN KEY ("assignmentId") REFERENCES "SurveyAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SurveyResponse" ADD CONSTRAINT "SurveyResponse_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AssessmentTarget" ADD CONSTRAINT "AssessmentTarget_staffId_fkey" FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
