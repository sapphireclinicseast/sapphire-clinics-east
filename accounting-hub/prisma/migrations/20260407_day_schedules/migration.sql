-- Per-day schedule overrides for employees
ALTER TABLE "Employee" ADD COLUMN IF NOT EXISTS "daySchedules" JSONB;
