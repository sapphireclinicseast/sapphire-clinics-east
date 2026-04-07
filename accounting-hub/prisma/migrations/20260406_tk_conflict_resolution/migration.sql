-- AlterEnum: Add BIOMETRIC_CONFLICT to TimekeepingSource
ALTER TYPE "TimekeepingSource" ADD VALUE IF NOT EXISTS 'BIOMETRIC_CONFLICT';

-- AlterTable: Add conflictData and dtrProof columns to TimekeepingRecord
ALTER TABLE "TimekeepingRecord" ADD COLUMN IF NOT EXISTS "conflictData" JSONB;
ALTER TABLE "TimekeepingRecord" ADD COLUMN IF NOT EXISTS "dtrProof" TEXT;
