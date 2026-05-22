-- One-shot password-reset link table. Admins (or a "Forgot password?" flow)
-- mint a token, the user clicks the email link, and a single use sets a new
-- password. Tokens expire 24h after issue.
CREATE TABLE IF NOT EXISTS "ClassPortalPasswordReset" (
    "id"          TEXT NOT NULL,
    "userId"      TEXT NOT NULL,
    "token"       TEXT NOT NULL,
    "expiresAt"   TIMESTAMP(3) NOT NULL,
    "usedAt"      TIMESTAMP(3),
    "requestedBy" TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClassPortalPasswordReset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalPasswordReset_token_key"
    ON "ClassPortalPasswordReset"("token");
CREATE INDEX IF NOT EXISTS "ClassPortalPasswordReset_userId_idx"
    ON "ClassPortalPasswordReset"("userId");
CREATE INDEX IF NOT EXISTS "ClassPortalPasswordReset_expiresAt_idx"
    ON "ClassPortalPasswordReset"("expiresAt");
