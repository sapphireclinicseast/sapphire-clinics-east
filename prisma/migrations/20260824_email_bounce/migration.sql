-- Hard/soft bounce records harvested from mailer-daemon reports.
CREATE TABLE IF NOT EXISTS "EmailBounce" (
  "id"           TEXT PRIMARY KEY,
  "email"        TEXT NOT NULL,
  "patientId"    TEXT,
  "kind"         TEXT NOT NULL,
  "statusCode"   TEXT,
  "reason"       TEXT,
  "gmailMsgId"   TEXT NOT NULL,
  "mailbox"      TEXT NOT NULL,
  "detectedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "unsubscribed" BOOLEAN NOT NULL DEFAULT false
);
-- gmailMsgId is the dedupe key: a rescan re-reads the same reports and must not
-- record them twice.
CREATE UNIQUE INDEX IF NOT EXISTS "EmailBounce_gmailMsgId_key" ON "EmailBounce"("gmailMsgId");
CREATE INDEX IF NOT EXISTS "EmailBounce_email_idx" ON "EmailBounce"("email");
CREATE INDEX IF NOT EXISTS "EmailBounce_kind_detectedAt_idx" ON "EmailBounce"("kind", "detectedAt");
