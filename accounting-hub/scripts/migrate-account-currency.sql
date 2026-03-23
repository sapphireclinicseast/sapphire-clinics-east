-- Add currency column to Account table
DO $$ BEGIN
  ALTER TABLE "Account" ADD COLUMN "currency" TEXT NOT NULL DEFAULT 'PHP';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
