-- Investor role: read-only account restricted to Clinic Utilization + Patient
-- Dashboard (enforced in application code, not the DB). Guarded add — replay-safe.
DO $$ BEGIN
  ALTER TYPE "Role" ADD VALUE 'INVESTOR';
EXCEPTION WHEN duplicate_object THEN null;
END $$;
