-- Promissory notes for class-portal tuition.
--
-- Signed paper or PDF notes a parent files when they can't settle a payment on
-- time but commit to a specific catch-up schedule. Front desk + admins
-- (ADMIN + BRANCH_ADMIN) upload the scan; the student themselves and SPED
-- teachers never see this table (it's a finance-office artefact).
--
-- Cap of 5 notes per student is enforced at the API layer, not here — more
-- than 5 means we're accepting too many promises for the same tuition and
-- need to escalate, not store silently.
--
-- Guarded: the migration folder replays on every deploy, so IF NOT EXISTS +
-- CREATE INDEX IF NOT EXISTS keeps it idempotent for the environments that
-- already have the table from a prior apply.
CREATE TABLE IF NOT EXISTS "ClassPortalPromissoryNote" (
    "id"           TEXT NOT NULL,
    "studentId"    TEXT NOT NULL,
    "studentEmail" TEXT NOT NULL,
    "studentName"  TEXT NOT NULL,
    "branch"       "ClassPortalBranch" NOT NULL,
    "fileName"     TEXT NOT NULL,
    "fileType"     TEXT NOT NULL,
    "fileSize"     INTEGER NOT NULL,
    "fileData"     BYTEA NOT NULL,
    "notes"        TEXT,
    "uploadedBy"   TEXT,
    "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"    TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ClassPortalPromissoryNote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClassPortalPromissoryNote_studentId_idx"
    ON "ClassPortalPromissoryNote" ("studentId");

CREATE INDEX IF NOT EXISTS "ClassPortalPromissoryNote_branch_createdAt_idx"
    ON "ClassPortalPromissoryNote" ("branch", "createdAt");
