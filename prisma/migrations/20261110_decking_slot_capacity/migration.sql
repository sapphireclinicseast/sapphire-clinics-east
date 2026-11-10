-- How many patients ONE cell of the decking board may hold.
--
-- Almost every hour is one patient with one therapist. A few are shared, and
-- the spreadsheet had no way to know which: it drew a single validated patient
-- line, so front desk wrote the second child as free text on the notes line.
-- Free text cannot be checked against the patient list — one mistyped name and
-- nobody is booked at all, which is how six real bookings were lost on the
-- East OT board on 2026-11-10.
--
-- A row exists only where the answer is more than one, so this table is the
-- list of shared hours rather than a copy of the board.
--
-- Guarded throughout — the deploy replays every migration on every run.
CREATE TABLE IF NOT EXISTS "DeckingSlotCapacity" (
  "id"         TEXT NOT NULL,
  "staffId"    TEXT NOT NULL,
  "branch"     TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "dayOfWeek"  TEXT NOT NULL,
  "startTime"  TEXT NOT NULL,
  "date"       TIMESTAMP(3),
  "capacity"   INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeckingSlotCapacity_pkey" PRIMARY KEY ("id")
);

-- NULLs are not equal to each other in SQL, so this unique index does NOT stop
-- two weekly rows for the same cell. The application reads with findFirst and
-- writes update-or-create for that reason; the index is here for the lookups
-- and for the dated rows, where it does bite.
CREATE UNIQUE INDEX IF NOT EXISTS "DeckingSlotCapacity_cell_key"
  ON "DeckingSlotCapacity" ("staffId", "dayOfWeek", "startTime", "date");
CREATE INDEX IF NOT EXISTS "DeckingSlotCapacity_branch_department_idx"
  ON "DeckingSlotCapacity" ("branch", "department");

DO $$ BEGIN
  ALTER TABLE "DeckingSlotCapacity"
    ADD CONSTRAINT "DeckingSlotCapacity_staffId_fkey"
    FOREIGN KEY ("staffId") REFERENCES "Staff"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: every cell that ALREADY holds more than one patient is a shared
-- hour, whatever anybody has declared. Without this the sheet would draw those
-- cells one line tall on the first sync after the deploy and the second child
-- would have nowhere to appear.
INSERT INTO "DeckingSlotCapacity" (
  "id", "staffId", "branch", "department", "dayOfWeek", "startTime", "date", "capacity"
)
SELECT
  md5(random()::text || clock_timestamp()::text),
  q."staffId", q."branch", q."department", q."dayOfWeek", q."startTime", q."date",
  LEAST(q.n, 3)
FROM (
  SELECT "staffId", branch, department, "dayOfWeek", "startTime", date, count(*) AS n
  FROM "DeckingSlot"
  WHERE "patientId" IS NOT NULL AND "isClass" = false
  GROUP BY 1, 2, 3, 4, 5, 6
  HAVING count(*) > 1
) q
WHERE NOT EXISTS (
  SELECT 1 FROM "DeckingSlotCapacity" c
  WHERE c."staffId" = q."staffId" AND c."dayOfWeek" = q."dayOfWeek"
    AND c."startTime" = q."startTime" AND c.date IS NOT DISTINCT FROM q.date
);
