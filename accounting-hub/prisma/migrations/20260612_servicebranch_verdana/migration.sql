-- Allow Verdana Store as a branch for Services (seminars & trainings fall under Verdana).
-- Idempotent + replay-safe (mirrors the PAYMONGO enum-value addition).
ALTER TYPE "ServiceBranch" ADD VALUE IF NOT EXISTS 'VERDANA_STORE';
