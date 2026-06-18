CREATE TABLE IF NOT EXISTS "ClinicCapSettings" (
    "id"          TEXT         NOT NULL DEFAULT 'default',
    "seaOt"       INTEGER      NOT NULL DEFAULT 8,
    "seaPt"       INTEGER      NOT NULL DEFAULT 8,
    "seaSlp"      INTEGER      NOT NULL DEFAULT 8,
    "seaSped"     INTEGER      NOT NULL DEFAULT 8,
    "seaMd"       INTEGER      NOT NULL DEFAULT 8,
    "seaPsych"    INTEGER      NOT NULL DEFAULT 8,
    "seaOrthosis" INTEGER      NOT NULL DEFAULT 8,
    "sghOt"       INTEGER      NOT NULL DEFAULT 8,
    "sghPt"       INTEGER      NOT NULL DEFAULT 8,
    "sghSlp"      INTEGER      NOT NULL DEFAULT 8,
    "sghSped"     INTEGER      NOT NULL DEFAULT 8,
    "sghMd"       INTEGER      NOT NULL DEFAULT 8,
    "sghPsych"    INTEGER      NOT NULL DEFAULT 8,
    "sghOrthosis" INTEGER      NOT NULL DEFAULT 8,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ClinicCapSettings_pkey" PRIMARY KEY ("id")
);
