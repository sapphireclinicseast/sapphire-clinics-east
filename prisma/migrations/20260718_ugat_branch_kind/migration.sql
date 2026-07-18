-- Add a BRANCH option kind (clinic branch the applicant is interested to work
-- in afterwards). In its own migration so the new enum value commits before the
-- next migration uses it. Idempotent.
ALTER TYPE "UgatOptionKind" ADD VALUE IF NOT EXISTS 'BRANCH';
