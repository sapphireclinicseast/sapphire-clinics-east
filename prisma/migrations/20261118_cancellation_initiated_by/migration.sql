-- Who called the session off: the patient, or us.
--
-- Guarded: the deploy replays every migration on every run, so an unguarded
-- ADD COLUMN fails the whole deploy the second time.
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "initiatedBy" TEXT;

-- Deliberately NOT backfilled to 'PATIENT'. Existing rows were logged with no
-- such question asked, so their attribution is genuinely unknown; writing one
-- in would make the first therapist-initiated report look authoritative while
-- being wrong about every row that predates the question.

-- How the cancelled session was funded. A guarantee letter has no two-free
-- allowance, so the fee rule depends on what paid for that session.
ALTER TABLE "CancellationLog" ADD COLUMN IF NOT EXISTS "paymentType" TEXT;

-- Not backfilled either. A row logged before the question existed was charged
-- under the ordinary allowance, and that is how it should keep reading.
