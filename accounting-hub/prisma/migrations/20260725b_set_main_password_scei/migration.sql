-- Set the main admin login (main@sapphireclinicseast.org) password to: scei (lowercase).
-- The deploy replays every migration.sql in folder order on each deploy; this runs
-- after 20260402_set_password_scei (which sets uppercase "SCEI" for both admins), so
-- it supersedes that value for main@ ONLY. admin@ is intentionally left untouched here.
-- Idempotent: re-applying always sets the same hash. Hash = bcryptjs cost 12 of "scei".
UPDATE "User"
SET "passwordHash" = '$2b$12$0qLCwPX6EL0g3ej2eUwBBeV3uJ08/nAQ9CnYGwctSDlYLdZRebR9O',
    "updatedAt"    = NOW()
WHERE email = 'main@sapphireclinicseast.org';
