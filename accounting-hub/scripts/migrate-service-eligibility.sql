-- ServiceEligibility: links package/VIP services to eligible earned services
CREATE TABLE IF NOT EXISTS "ServiceEligibility" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid()::text,
  "parentServiceId" TEXT NOT NULL,
  "eligibleServiceId" TEXT NOT NULL,
  "discountPercent" DECIMAL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ServiceEligibility_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ServiceEligibility_parentServiceId_fkey" FOREIGN KEY ("parentServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ServiceEligibility_eligibleServiceId_fkey" FOREIGN KEY ("eligibleServiceId") REFERENCES "Service"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ServiceEligibility_parentServiceId_eligibleServiceId_key"
  ON "ServiceEligibility"("parentServiceId", "eligibleServiceId");
CREATE INDEX IF NOT EXISTS "ServiceEligibility_parentServiceId_idx"
  ON "ServiceEligibility"("parentServiceId");
CREATE INDEX IF NOT EXISTS "ServiceEligibility_eligibleServiceId_idx"
  ON "ServiceEligibility"("eligibleServiceId");
