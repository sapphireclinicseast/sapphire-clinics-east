-- Add NURSERY as the lowest grade level (younger than Kinder).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum
        WHERE enumlabel = 'NURSERY'
          AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'ClassPortalLevel')
    ) THEN
        ALTER TYPE "ClassPortalLevel" ADD VALUE 'NURSERY' BEFORE 'KINDER';
    END IF;
END
$$;
