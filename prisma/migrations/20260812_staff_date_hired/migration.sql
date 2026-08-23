-- AlterTable
-- Date Hired, synced one-way from HR Platform Staff Profile. Used by
-- Therapist Utilization (Clinic Utilization dashboard) to exclude days
-- before a therapist's hire date from their capacity/available-slots
-- count — otherwise a recently hired therapist's utilization looked
-- artificially low for months they weren't yet on staff.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "dateHired" TIMESTAMP(3);
