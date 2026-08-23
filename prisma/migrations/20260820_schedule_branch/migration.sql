-- Where a session actually happens ("SBEA" | "SBGH" | "VER"), captured from
-- the branch calendar it was booked on. Interbranch clinicians hold one staff
-- profile pinned to a single branch, so staff.branch cannot attribute their
-- cross-branch sessions; the cashier queue reads this field first.
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "branch" TEXT;
