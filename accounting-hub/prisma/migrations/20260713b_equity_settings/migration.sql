-- Corporate equity anchor (singleton): authorized shares fix total issued capital.
CREATE TABLE IF NOT EXISTS "EquitySettings" (
  "id" TEXT NOT NULL,
  "authorizedShares" INTEGER NOT NULL DEFAULT 20000000,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "EquitySettings_pkey" PRIMARY KEY ("id")
);
