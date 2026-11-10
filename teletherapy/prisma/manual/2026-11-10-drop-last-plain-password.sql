-- Erase the readable copies of Staff Portal passwords.
--
-- TherapistAccount."lastPlainPassword" held the last-set password in plain
-- text so the Admin Panel could display it. The app no longer writes or reads
-- it (passwords are shown once, when set). This clears what is already stored.
--
-- MANUAL ONLY. This file is deliberately NOT under prisma/migrations — the
-- marketing-hub migration step replays that folder on every deploy.
--
-- Run it AFTER the deploy that removed lastPlainPassword from the app, and
-- only with Hannah's go-ahead: until it runs, the old values are still there.
-- Once it runs, nobody can look a password up — a forgotten one is replaced
-- with "Set a new password" (key icon) in the Admin Panel.
--
--   docker exec -i sapphire_db psql -U sapphire -d sapphire_marketing -v ON_ERROR_STOP=1 \
--     < teletherapy/prisma/manual/2026-11-10-drop-last-plain-password.sql
--
-- Do not back the column up first — a backup of it is the thing being removed.

-- 1. Before: how many accounts still have a readable password.
SELECT count(*) AS accounts, count("lastPlainPassword") AS with_readable_password
FROM "TherapistAccount";

-- 2. Clear them.
BEGIN;
UPDATE "TherapistAccount" SET "lastPlainPassword" = NULL
WHERE "lastPlainPassword" IS NOT NULL;
COMMIT;

-- 3. UPDATE leaves the old row versions on disk until vacuumed; rewrite the
--    (small) table so the values are actually gone from the data files.
VACUUM FULL "TherapistAccount";

-- 4. After: should be 0.
SELECT count("lastPlainPassword") AS with_readable_password FROM "TherapistAccount";

-- 5. LATER (once a week or so has passed with nothing missing it): drop the
--    column outright. Left commented so step 2 can be run on its own first.
-- ALTER TABLE "TherapistAccount" DROP COLUMN IF EXISTS "lastPlainPassword";
