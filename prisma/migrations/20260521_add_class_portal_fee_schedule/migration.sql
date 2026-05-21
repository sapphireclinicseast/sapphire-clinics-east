-- ClassPortal: admin-editable fee schedule, one row per branch.
CREATE TABLE IF NOT EXISTS "ClassPortalFeeSchedule" (
    "branch" "ClassPortalBranch" NOT NULL,
    "tuitionAnnualCentavos" INTEGER NOT NULL DEFAULT 0,
    "tuitionBiannualCentavos" INTEGER NOT NULL DEFAULT 0,
    "tuitionMonthlyCentavos" INTEGER NOT NULL DEFAULT 0,
    "miscAnnualCentavos" INTEGER NOT NULL DEFAULT 0,
    "miscBiannualCentavos" INTEGER NOT NULL DEFAULT 0,
    "miscMonthlyCentavos" INTEGER NOT NULL DEFAULT 0,
    "extraItems" JSONB NOT NULL DEFAULT '[]',
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "updatedBy" TEXT,
    CONSTRAINT "ClassPortalFeeSchedule_pkey" PRIMARY KEY ("branch")
);
