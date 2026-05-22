-- Password-reset audit trail on ClassPortalUser. Plaintext passwords are
-- NEVER stored — these columns just record who set the password last and
-- when, so the admin user list shows "Last reset by X on YYYY-MM-DD"
-- instead of the unhelpful "not on device" placeholder.
ALTER TABLE "ClassPortalUser"
    ADD COLUMN IF NOT EXISTS "passwordSetAt" TIMESTAMP(3),
    ADD COLUMN IF NOT EXISTS "passwordSetBy" TEXT;
