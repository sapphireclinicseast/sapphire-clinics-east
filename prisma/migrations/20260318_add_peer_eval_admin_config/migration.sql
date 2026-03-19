-- CreateTable: PeerEvalAdminConfig
CREATE TABLE IF NOT EXISTS "PeerEvalAdminConfig" (
    "id"        TEXT NOT NULL,
    "staffId"   TEXT NOT NULL,
    "workDays"  JSONB NOT NULL,
    "branch"    TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerEvalAdminConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PeerEvalAdminConfig_staffId_key" ON "PeerEvalAdminConfig"("staffId");

-- AddForeignKey
ALTER TABLE "PeerEvalAdminConfig"
    ADD CONSTRAINT "PeerEvalAdminConfig_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
