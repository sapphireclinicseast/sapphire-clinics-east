-- AlterTable: Add fee tracking fields to CancellationLog
ALTER TABLE "CancellationLog" ADD COLUMN "feeDeducted" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CancellationLog" ADD COLUMN "feeDeductedAt" TIMESTAMP(3);
ALTER TABLE "CancellationLog" ADD COLUMN "feePaidOnReturn" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "CancellationLog" ADD COLUMN "feePaidAt" TIMESTAMP(3);

-- CreateTable: NoShowLog
CREATE TABLE "NoShowLog" (
    "id" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "staffId" TEXT,
    "branch" TEXT NOT NULL,
    "remarks" TEXT,
    "feeDeducted" BOOLEAN NOT NULL DEFAULT false,
    "feeDeductedAt" TIMESTAMP(3),
    "feePaidOnReturn" BOOLEAN NOT NULL DEFAULT false,
    "feePaidAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "deletedBy" TEXT,
    "deleteReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NoShowLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NoShowLog_patientId_idx" ON "NoShowLog"("patientId");
CREATE INDEX "NoShowLog_createdAt_idx" ON "NoShowLog"("createdAt");

-- AddForeignKey
ALTER TABLE "NoShowLog" ADD CONSTRAINT "NoShowLog_patientId_fkey" FOREIGN KEY ("patientId") REFERENCES "Patient"("id") ON DELETE CASCADE ON UPDATE CASCADE;
