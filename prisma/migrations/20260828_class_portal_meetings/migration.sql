-- Class-portal Meetings: teachers create meet.sapphireclinicseast.org
-- links, optionally tag students. Links signed by the ops-hub
-- MEET_LINK_SECRET; participants can record via LiveKit egress.

CREATE TABLE IF NOT EXISTS "ClassPortalMeeting" (
  "id"            TEXT PRIMARY KEY,
  "teacherId"    TEXT NOT NULL,
  "teacherEmail"  TEXT NOT NULL,
  "teacherName"   TEXT NOT NULL,
  "room"          TEXT NOT NULL UNIQUE,
  "title"         TEXT NOT NULL,
  "notes"         TEXT,
  "scheduledAt"   TIMESTAMP(3) NOT NULL,
  "endsAt"        TIMESTAMP(3) NOT NULL,
  "cancelledAt"   TIMESTAMP(3),
  "cancelledBy"   TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL
);
CREATE INDEX IF NOT EXISTS "ClassPortalMeeting_teacherId_idx"   ON "ClassPortalMeeting"("teacherId");
CREATE INDEX IF NOT EXISTS "ClassPortalMeeting_scheduledAt_idx" ON "ClassPortalMeeting"("scheduledAt");

CREATE TABLE IF NOT EXISTS "ClassPortalMeetingParticipant" (
  "id"            TEXT PRIMARY KEY,
  "meetingId"     TEXT NOT NULL,
  "studentId"     TEXT NOT NULL,
  "studentEmail"  TEXT NOT NULL,
  "studentName"   TEXT NOT NULL,
  "invitedAt"     TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ClassPortalMeetingParticipant_meetingId_fkey"
    FOREIGN KEY ("meetingId") REFERENCES "ClassPortalMeeting"("id") ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS "ClassPortalMeetingParticipant_meetingId_idx" ON "ClassPortalMeetingParticipant"("meetingId");
CREATE INDEX IF NOT EXISTS "ClassPortalMeetingParticipant_studentId_idx" ON "ClassPortalMeetingParticipant"("studentId");
CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalMeetingParticipant_meetingId_studentId_key" ON "ClassPortalMeetingParticipant"("meetingId","studentId");
