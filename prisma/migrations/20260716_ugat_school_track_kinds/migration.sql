-- Split the single UgatOption "SCHOOL" list into two per-track lists so the
-- admin can accept different schools for the Aral Track vs the Tindig Track.
-- Adds two values to the UgatOptionKind enum. Idempotent (IF NOT EXISTS) so
-- the deploy can replay it safely. Kept in its own migration ahead of the
-- seed migration: a newly added enum value cannot be used in the same
-- transaction it is created, so the ADD VALUE must commit first.

ALTER TYPE "UgatOptionKind" ADD VALUE IF NOT EXISTS 'SCHOOL_ARAL';
ALTER TYPE "UgatOptionKind" ADD VALUE IF NOT EXISTS 'SCHOOL_TINDIG';
