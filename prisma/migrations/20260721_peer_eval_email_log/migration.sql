-- Track when an admin emailed an assessor about pending peer evaluations.
-- One row per (assessor, branch, year, month) — drives the persistent "Email sent!" button state.
CREATE TABLE IF NOT EXISTS "PeerEvalEmailLog" (
  "id"          TEXT        NOT NULL,
  "assessorId"  TEXT        NOT NULL,
  "branch"      TEXT        NOT NULL,
  "periodYear"  INTEGER     NOT NULL,
  "periodMonth" INTEGER     NOT NULL,
  "sentAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "sentBy"      TEXT,
  CONSTRAINT "PeerEvalEmailLog_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "PeerEvalEmailLog"
  ADD CONSTRAINT "PeerEvalEmailLog_assessorId_fkey"
  FOREIGN KEY ("assessorId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "PeerEvalEmailLog_assessorId_branch_periodYear_periodMonth_key"
  ON "PeerEvalEmailLog"("assessorId", "branch", "periodYear", "periodMonth");
