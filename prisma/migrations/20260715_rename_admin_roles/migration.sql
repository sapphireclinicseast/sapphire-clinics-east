-- Rename admin Role enum values from SBEA/SBGH prefix to AHEA/AHGH prefix.
-- Wrapped in DO blocks so re-runs (e.g. after a partial deploy) do not error
-- if the label has already been renamed. ALTER TYPE ... RENAME VALUE is atomic
-- so we do not need a transaction.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SBEA_ADMIN' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')) THEN
    EXECUTE 'ALTER TYPE "Role" RENAME VALUE ''SBEA_ADMIN'' TO ''AHEA_ADMIN''';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SBGH_ADMIN' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')) THEN
    EXECUTE 'ALTER TYPE "Role" RENAME VALUE ''SBGH_ADMIN'' TO ''AHGH_ADMIN''';
  END IF;
END $$;
