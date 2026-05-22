-- Audit log for "View as" admin impersonation. One row per session minted;
-- endedAt is set when the admin clicks "Return to admin" (best-effort).
CREATE TABLE IF NOT EXISTS "ClassPortalImpersonationLog" (
    "id"           TEXT NOT NULL,
    "adminEmail"   TEXT NOT NULL,
    "targetUserId" TEXT NOT NULL,
    "targetEmail"  TEXT NOT NULL,
    "targetRole"   TEXT NOT NULL,
    "startedAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt"      TIMESTAMP(3),
    "reason"       TEXT,
    CONSTRAINT "ClassPortalImpersonationLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ClassPortalImpersonationLog_adminEmail_idx"
    ON "ClassPortalImpersonationLog"("adminEmail");
CREATE INDEX IF NOT EXISTS "ClassPortalImpersonationLog_targetUserId_idx"
    ON "ClassPortalImpersonationLog"("targetUserId");
CREATE INDEX IF NOT EXISTS "ClassPortalImpersonationLog_startedAt_idx"
    ON "ClassPortalImpersonationLog"("startedAt");
