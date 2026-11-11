-- One "we have slots" message sent to somebody on the waitlist.
--
-- Keyed to the HR form submission rather than to a Patient: the waitlist lives
-- in HR Platform and these people are not patients here yet.
--
-- No unique constraint on (submission, channel) — slots open again, and the
-- same family may be told twice months apart. Every send is a row.
CREATE TABLE "WaitlistOutreach" (
    "id"           TEXT NOT NULL,
    "formId"       TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "channel"      TEXT NOT NULL,
    "branch"       TEXT NOT NULL,
    "sentTo"       TEXT NOT NULL,
    "subject"      TEXT,
    "message"      TEXT NOT NULL,
    "sentByName"   TEXT,
    "sentAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WaitlistOutreach_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "WaitlistOutreach_formId_submissionId_idx" ON "WaitlistOutreach"("formId", "submissionId");
CREATE INDEX "WaitlistOutreach_sentAt_idx" ON "WaitlistOutreach"("sentAt");
