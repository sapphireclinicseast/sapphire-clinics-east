ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "isClinicalSupervisor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "isClinicalMentor" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "isMentee" BOOLEAN NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS "MentorshipMeetingCharge" (
  "id" TEXT PRIMARY KEY,
  "externalMeetingId" TEXT NOT NULL,
  "meetingDate" TIMESTAMP(3) NOT NULL,
  "title" TEXT,
  "mentorConsultantId" TEXT REFERENCES "Consultant"("id") ON DELETE SET NULL,
  "mentorName" TEXT NOT NULL,
  "menteeConsultantId" TEXT REFERENCES "Consultant"("id") ON DELETE SET NULL,
  "menteeName" TEXT NOT NULL,
  "fee" DECIMAL(65,30) NOT NULL,
  "cutoffPeriod" TEXT NOT NULL,
  "branch" TEXT NOT NULL,
  "lockedAt" TIMESTAMP(3),
  "paidNotifiedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "MentorshipMeetingCharge_externalMeetingId_menteeName_key"
  ON "MentorshipMeetingCharge"("externalMeetingId", "menteeName");
CREATE INDEX IF NOT EXISTS "MentorshipMeetingCharge_cutoffPeriod_branch_idx" ON "MentorshipMeetingCharge"("cutoffPeriod", "branch");
CREATE INDEX IF NOT EXISTS "MentorshipMeetingCharge_mentorConsultantId_idx" ON "MentorshipMeetingCharge"("mentorConsultantId");
CREATE INDEX IF NOT EXISTS "MentorshipMeetingCharge_menteeConsultantId_idx" ON "MentorshipMeetingCharge"("menteeConsultantId");

CREATE TABLE IF NOT EXISTS "MentorshipFeeSetting" (
  "id" INTEGER PRIMARY KEY,
  "meetingFee" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
