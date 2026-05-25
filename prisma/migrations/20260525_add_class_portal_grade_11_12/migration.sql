-- Add GRADE_11 and GRADE_12 as the highest grade levels (senior high).
-- Idempotent so re-running the migrate container is safe.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'GRADE_11'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ClassPortalLevel')
    ) THEN
        ALTER TYPE "ClassPortalLevel" ADD VALUE 'GRADE_11' AFTER 'GRADE_10';
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'GRADE_12'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ClassPortalLevel')
    ) THEN
        ALTER TYPE "ClassPortalLevel" ADD VALUE 'GRADE_12' AFTER 'GRADE_11';
    END IF;
END
$$;
