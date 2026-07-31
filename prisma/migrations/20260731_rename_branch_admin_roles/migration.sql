-- Rename branch-admin role enum values from SBEA/SBGH prefix to AHEA/AHGH prefix.
-- The production DB was already renamed by hand; these guarded blocks make the
-- migration replay-safe (the deploy pipeline re-runs every migration.sql).
DO $$ BEGIN
  ALTER TYPE "Role" RENAME VALUE 'SBEA_ADMIN' TO 'AHEA_ADMIN';
EXCEPTION WHEN OTHERS THEN null;
END $$;
DO $$ BEGIN
  ALTER TYPE "Role" RENAME VALUE 'SBGH_ADMIN' TO 'AHGH_ADMIN';
EXCEPTION WHEN OTHERS THEN null;
END $$;
