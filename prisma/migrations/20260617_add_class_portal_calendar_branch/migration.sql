-- Per-branch academic calendar (East vs Greenhills). The existing
-- single-tenant rows are wiped on the FIRST run only — admin will
-- repopulate per branch from the UI. Subsequent runs are no-ops.
-- Idempotent so the migrate container can re-run safely.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = current_schema()
      AND table_name   = 'ClassPortalCalendarEvent'
      AND column_name  = 'branch'
  ) THEN
    DELETE FROM "ClassPortalCalendarEvent";
    DELETE FROM "ClassPortalCalendarPdf";
    ALTER TABLE "ClassPortalCalendarEvent" ADD COLUMN "branch" "ClassPortalBranch" NOT NULL;
    ALTER TABLE "ClassPortalCalendarPdf"   ADD COLUMN "branch" "ClassPortalBranch" NOT NULL;
  END IF;
END $$;

-- One PDF per branch.
ALTER TABLE "ClassPortalCalendarPdf" DROP CONSTRAINT IF EXISTS "ClassPortalCalendarPdf_branch_key";
ALTER TABLE "ClassPortalCalendarPdf" ADD  CONSTRAINT "ClassPortalCalendarPdf_branch_key" UNIQUE ("branch");

-- Replace the date-only index with a (branch, date) composite so
-- per-branch range scans hit the index.
DROP INDEX IF EXISTS "ClassPortalCalendarEvent_date_idx";
CREATE INDEX IF NOT EXISTS "ClassPortalCalendarEvent_branch_date_idx"
  ON "ClassPortalCalendarEvent" ("branch", "date");
