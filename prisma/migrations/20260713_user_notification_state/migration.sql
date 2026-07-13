-- Per-user notification dismiss state (bell badge persistence)
CREATE TABLE IF NOT EXISTS "UserNotificationState" (
  "userId"      TEXT         NOT NULL,
  "dismissedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotificationState_pkey" PRIMARY KEY ("userId")
);
