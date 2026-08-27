-- Work Arrangement, synced one-way from HR's Staff Profile.
--
-- Groups consultants into the Decking board's On-site / Teletherapy / Homecare
-- sections. Stored as HR's raw slug so a label reword in HR cannot regroup
-- boards here. Nullable: most of the roster is untagged, and untagged is a
-- real state (surfaced under "All"), not a missing value to backfill.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "workArrangement" TEXT;
CREATE INDEX IF NOT EXISTS "Staff_workArrangement_idx" ON "Staff"("workArrangement");
