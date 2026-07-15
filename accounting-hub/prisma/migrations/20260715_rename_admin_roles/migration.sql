-- Rename admin Role enum values from SBEA/SBGH prefix to AHEA/AHGH prefix.
-- Wrapped in DO blocks so re-runs (e.g. after a partial deploy) do not error
-- if the label has already been renamed. This DB also has *_FRONTDESK (no
-- underscore) variants that the marketing DB does not have.

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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SBEA_FRONTDESK' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')) THEN
    EXECUTE 'ALTER TYPE "Role" RENAME VALUE ''SBEA_FRONTDESK'' TO ''AHEA_FRONTDESK''';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'SBGH_FRONTDESK' AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'Role')) THEN
    EXECUTE 'ALTER TYPE "Role" RENAME VALUE ''SBGH_FRONTDESK'' TO ''AHGH_FRONTDESK''';
  END IF;
END $$;
