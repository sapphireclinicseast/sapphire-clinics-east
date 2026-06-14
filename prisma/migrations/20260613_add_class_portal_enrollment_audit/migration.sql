-- Defensive audit log for the class-portal enrollment funnel.
-- Idempotent: CREATE TABLE / CREATE INDEX guarded by IF NOT EXISTS so
-- re-running the migrate container in a partial environment is safe.

CREATE TABLE IF NOT EXISTS "ClassPortalEnrollmentAudit" (
  "id"         TEXT PRIMARY KEY,
  "kind"       TEXT NOT NULL,
  "email"      TEXT,
  "studentId"  TEXT,
  "docKey"     TEXT,
  "outcome"    TEXT NOT NULL,
  "error"      TEXT,
  "ip"         TEXT,
  "userAgent"  TEXT,
  "metadata"   JSONB,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS "ClassPortalEnrollmentAudit_createdAt_idx" ON "ClassPortalEnrollmentAudit"("createdAt");
CREATE INDEX IF NOT EXISTS "ClassPortalEnrollmentAudit_email_idx"     ON "ClassPortalEnrollmentAudit"("email");
CREATE INDEX IF NOT EXISTS "ClassPortalEnrollmentAudit_kind_idx"      ON "ClassPortalEnrollmentAudit"("kind");
