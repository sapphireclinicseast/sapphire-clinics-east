-- Multi-branch user access. Existing single-branch users keep their `branch`;
-- `branches` (when non-empty) is the authoritative access set.
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "branches" "Branch"[] NOT NULL DEFAULT ARRAY[]::"Branch"[];
