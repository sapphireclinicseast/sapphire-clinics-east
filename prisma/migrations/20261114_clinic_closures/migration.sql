-- Days the clinic did not open: public holidays, typhoons, floods.
--
-- Every statement is guarded. Deploy replays every migration on every run,
-- so an unguarded CREATE TABLE fails the whole deploy on the second run.

CREATE TABLE IF NOT EXISTS "ClinicClosure" (
  "id"            TEXT         NOT NULL,
  "date"          TIMESTAMP(3) NOT NULL,
  "branch"        TEXT         NOT NULL DEFAULT 'ALL',
  "reason"        TEXT,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdByName" TEXT,
  CONSTRAINT "ClinicClosure_pkey" PRIMARY KEY ("id")
);

-- One row per day per branch. 'ALL' is a sentinel rather than NULL precisely
-- so this index holds: Postgres treats NULLs as distinct and would let the
-- same closure be recorded twice.
CREATE UNIQUE INDEX IF NOT EXISTS "ClinicClosure_date_branch_key"
  ON "ClinicClosure" ("date", "branch");

CREATE INDEX IF NOT EXISTS "ClinicClosure_date_idx"
  ON "ClinicClosure" ("date");
