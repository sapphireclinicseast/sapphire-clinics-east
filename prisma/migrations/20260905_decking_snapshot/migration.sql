-- Daily history of the decking board. Guarded for deploy replay.
CREATE TABLE IF NOT EXISTS "DeckingSnapshot" (
  "id"         TEXT NOT NULL,
  "date"       TIMESTAMP(3) NOT NULL,
  "branch"     TEXT NOT NULL,
  "department" TEXT NOT NULL,
  "totalSlots" INTEGER NOT NULL,
  "booked"     INTEGER NOT NULL,
  "blocked"    INTEGER NOT NULL,
  "open"       INTEGER NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "DeckingSnapshot_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "DeckingSnapshot_date_branch_department_key"
  ON "DeckingSnapshot"("date", "branch", "department");
CREATE INDEX IF NOT EXISTS "DeckingSnapshot_branch_department_date_idx"
  ON "DeckingSnapshot"("branch", "department", "date");
