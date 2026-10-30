-- Front desk follow-up state for Patient Relationship → Waitlist entries.
--
-- The entries are HR Platform form submissions, so this keys off
-- (formId, submissionId) instead of a foreign key.
--
-- Guarded with IF NOT EXISTS throughout: this deploy replays every migration
-- on every run with no tracker, so each one has to be safe to re-apply.

CREATE TABLE IF NOT EXISTS "WaitlistFollowUp" (
  "id"           TEXT         NOT NULL,
  "formId"       TEXT         NOT NULL,
  "submissionId" TEXT         NOT NULL,
  "status"       TEXT         NOT NULL,
  "remarks"      TEXT         NOT NULL DEFAULT '',
  "setByName"    TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "WaitlistFollowUp_pkey" PRIMARY KEY ("id")
);

-- One live state per waitlist entry, so re-tagging edits the existing row.
CREATE UNIQUE INDEX IF NOT EXISTS "WaitlistFollowUp_formId_submissionId_key"
  ON "WaitlistFollowUp" ("formId", "submissionId");

CREATE INDEX IF NOT EXISTS "WaitlistFollowUp_formId_idx"
  ON "WaitlistFollowUp" ("formId");
