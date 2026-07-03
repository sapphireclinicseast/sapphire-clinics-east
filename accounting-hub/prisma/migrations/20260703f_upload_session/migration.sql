CREATE TABLE IF NOT EXISTS "UploadSession" (
  "id" TEXT NOT NULL,
  "prefix" TEXT NOT NULL,
  "section" TEXT NOT NULL,
  "urls" JSONB NOT NULL DEFAULT '[]',
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UploadSession_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "UploadSession_expiresAt_idx" ON "UploadSession"("expiresAt");
