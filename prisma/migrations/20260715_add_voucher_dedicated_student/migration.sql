-- Add dedicatedStudentId to ClassPortalVoucher so admin can mint
-- personal vouchers (only usable by the one student they're issued to).
-- Idempotent so the migrate container can re-run safely.

ALTER TABLE "ClassPortalVoucher" ADD COLUMN IF NOT EXISTS "dedicatedStudentId" TEXT;

CREATE INDEX IF NOT EXISTS "ClassPortalVoucher_dedicatedStudentId_idx"
  ON "ClassPortalVoucher" ("dedicatedStudentId");
