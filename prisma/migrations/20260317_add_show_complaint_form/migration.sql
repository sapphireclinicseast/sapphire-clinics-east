-- Add showComplaintForm to SurveySettings
ALTER TABLE "SurveySettings" ADD COLUMN IF NOT EXISTS "showComplaintForm" BOOLEAN NOT NULL DEFAULT false;
