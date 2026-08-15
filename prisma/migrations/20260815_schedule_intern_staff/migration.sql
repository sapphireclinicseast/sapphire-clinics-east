-- Interns: which intern (if any) actually did a booked session — the
-- Schedule row's existing staffId stays the supervising therapist whose
-- card it was booked under. Nullable; only set when Session Type is
-- "IE Intern" / "Session Intern" and front desk picked an intern.
ALTER TABLE "Schedule" ADD COLUMN IF NOT EXISTS "internStaffId" TEXT;

-- Staff.contractExpiry — an intern's End Month, synced one-way from HR
-- Platform (mirrors Staff.dateHired / "Start Month", added in
-- 20260812_staff_date_hired). Used to gate the Clinic Schedule intern
-- picker to only currently-active interns.
ALTER TABLE "Staff" ADD COLUMN IF NOT EXISTS "contractExpiry" TIMESTAMP(3);
