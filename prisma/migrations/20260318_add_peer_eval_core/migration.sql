-- CreateEnum
DO $$ BEGIN
  CREATE TYPE "PeerEvalType" AS ENUM ('HR08_ADMIN', 'HR08_PEER', 'HR09');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "PeerEvalStatus" AS ENUM ('PENDING', 'COMPLETED', 'EXPIRED');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

-- CreateTable: PeerEvalAssignment
CREATE TABLE IF NOT EXISTS "PeerEvalAssignment" (
    "id"          TEXT NOT NULL,
    "formType"    "PeerEvalType" NOT NULL,
    "assessorId"  TEXT NOT NULL,
    "assesseeId"  TEXT NOT NULL,
    "branch"      TEXT NOT NULL,
    "periodYear"  INTEGER NOT NULL,
    "periodMonth" INTEGER NOT NULL,
    "status"      "PeerEvalStatus" NOT NULL DEFAULT 'PENDING',
    "notes"       TEXT,
    "completedAt" TIMESTAMP(3),
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerEvalAssignment_pkey" PRIMARY KEY ("id")
);

-- CreateTable: PeerEvalResponse
CREATE TABLE IF NOT EXISTS "PeerEvalResponse" (
    "id"           TEXT NOT NULL,
    "assignmentId" TEXT NOT NULL,
    "assessorId"   TEXT NOT NULL,
    "assesseeId"   TEXT NOT NULL,
    "formType"     "PeerEvalType" NOT NULL,
    "branch"       TEXT NOT NULL,
    "scores"       JSONB NOT NULL,
    "strengths"    TEXT,
    "improvements" TEXT,
    "submittedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PeerEvalResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "PeerEvalAssignment_unique"
    ON "PeerEvalAssignment"("assessorId", "assesseeId", "formType", "periodYear", "periodMonth");

CREATE UNIQUE INDEX IF NOT EXISTS "PeerEvalResponse_assignmentId_key"
    ON "PeerEvalResponse"("assignmentId");

-- AddForeignKey
ALTER TABLE "PeerEvalAssignment"
    ADD CONSTRAINT "PeerEvalAssignment_assessorId_fkey"
    FOREIGN KEY ("assessorId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PeerEvalAssignment"
    ADD CONSTRAINT "PeerEvalAssignment_assesseeId_fkey"
    FOREIGN KEY ("assesseeId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PeerEvalResponse"
    ADD CONSTRAINT "PeerEvalResponse_assignmentId_fkey"
    FOREIGN KEY ("assignmentId") REFERENCES "PeerEvalAssignment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PeerEvalResponse"
    ADD CONSTRAINT "PeerEvalResponse_assessorId_fkey"
    FOREIGN KEY ("assessorId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PeerEvalResponse"
    ADD CONSTRAINT "PeerEvalResponse_assesseeId_fkey"
    FOREIGN KEY ("assesseeId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
