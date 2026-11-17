-- How the missed session was funded.
--
-- A guarantee letter bought a named session, the clinician held the hour and
-- nobody came. That is charged to the letter every time — there is no
-- allowance to spend against a no-show and nothing to waive.
--
-- Guarded: the deploy replays every migration on every run.
ALTER TABLE "NoShowLog" ADD COLUMN IF NOT EXISTS "paymentType" TEXT;

-- Not backfilled. Rows logged before the question existed have no recorded
-- funding, and reading them all as GL would bill letters for sessions nobody
-- checked.
