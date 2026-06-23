-- One row per payment-reminder email actually sent. The daily cron
-- consults this table to skip students who already got a reminder for
-- the same (period, reason) — keeps senders idempotent.
-- Idempotent so the migrate container can re-run safely.

CREATE TABLE IF NOT EXISTS "ClassPortalPaymentReminderLog" (
  "id"        TEXT PRIMARY KEY,
  "studentId" TEXT NOT NULL,
  "email"     TEXT NOT NULL,
  "plan"      TEXT NOT NULL,
  "period"    TEXT NOT NULL,
  "dueOn"     DATE NOT NULL,
  "reason"    TEXT NOT NULL,
  "severity"  TEXT NOT NULL,
  "sentAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalPaymentReminderLog_studentId_period_reason_key"
  ON "ClassPortalPaymentReminderLog" ("studentId", "period", "reason");

CREATE INDEX IF NOT EXISTS "ClassPortalPaymentReminderLog_sentAt_idx"
  ON "ClassPortalPaymentReminderLog" ("sentAt");

CREATE INDEX IF NOT EXISTS "ClassPortalPaymentReminderLog_studentId_idx"
  ON "ClassPortalPaymentReminderLog" ("studentId");
