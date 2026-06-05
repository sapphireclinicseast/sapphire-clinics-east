-- Class-portal tuition discount vouchers.
-- Idempotent so re-running the migrate container is safe.

CREATE TABLE IF NOT EXISTS "ClassPortalVoucher" (
    "id"              TEXT NOT NULL,
    "code"            TEXT NOT NULL,
    "discountPercent" INTEGER NOT NULL DEFAULT 0,
    "validUntil"      TIMESTAMP(3) NOT NULL,
    "enabled"         BOOLEAN NOT NULL DEFAULT true,
    "createdAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedBy"       TEXT,
    CONSTRAINT "ClassPortalVoucher_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "ClassPortalVoucher_code_key" ON "ClassPortalVoucher"("code");
