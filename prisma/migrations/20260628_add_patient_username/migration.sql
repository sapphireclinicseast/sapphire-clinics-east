-- Portal login handle. Lets siblings who share one parent email pick distinct
-- usernames so each can log in separately. Nullable + unique (Postgres allows
-- multiple NULLs, so existing patients are unaffected until they choose one).
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "username" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "Patient_username_key" ON "Patient"("username");
