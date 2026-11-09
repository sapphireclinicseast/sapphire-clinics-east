-- Waiting-room announcements: short lines front desk type themselves, shown on
-- the queue TV in the same rotation as the uploaded videos and photos.
--
-- Three per scope, addressed by `slot`, rather than a free-growing list. Front
-- desk edit three boxes; a board that can grow without limit turns into a wall
-- of text nobody reads, and the unique constraint is what makes "box 2" the
-- same row every time it is saved instead of accumulating duplicates.
--
-- `branch` matches QueueAd: 'ALL' | 'SBEA' | 'SBGH'. Branch-restricted accounts
-- can only reach their own branch, so Greenhills cannot overwrite what East
-- has up on its screen.
--
-- Guarded — the deploy replays every migration on every run.
CREATE TABLE IF NOT EXISTS "QueueAnnouncement" (
  "id"        TEXT         NOT NULL,
  "branch"    TEXT         NOT NULL DEFAULT 'ALL',
  "slot"      INTEGER      NOT NULL,
  "text"      TEXT         NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "QueueAnnouncement_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "QueueAnnouncement_branch_slot_key"
  ON "QueueAnnouncement"("branch", "slot");
