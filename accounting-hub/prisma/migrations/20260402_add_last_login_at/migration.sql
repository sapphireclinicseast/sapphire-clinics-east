-- Add lastLoginAt column to User table (missing from live DB)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "lastLoginAt" TIMESTAMP(3);
