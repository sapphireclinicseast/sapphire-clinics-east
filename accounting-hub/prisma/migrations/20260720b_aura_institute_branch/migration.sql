-- Add the fourth branch, Aura Health Institute, to the Branch enum.
-- Idempotent: safe to replay on environments where it already exists.
ALTER TYPE "Branch" ADD VALUE IF NOT EXISTS 'AURA_INSTITUTE';
