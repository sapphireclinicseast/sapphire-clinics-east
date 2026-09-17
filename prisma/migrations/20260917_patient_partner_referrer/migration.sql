-- Where a patient came from: a partner school, or a referring doctor.
--
-- Both captured on the public registration form. Partner institution is picked
-- from the list HR maintains; referring doctor is picked from the Accounting
-- Hub referrer list or typed free-hand when the doctor is not on it yet.
--
-- Stored as names rather than ids on purpose. Neither list lives in this
-- database — partners are HR Hub records and referrers are Accounting Hub
-- records — so an id column here would point at a table that does not exist,
-- and every other place in this app already matches partners by name.
--
-- Guarded: the migration folder replays on every deploy.
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "partnerInstitution" TEXT;
ALTER TABLE "Patient" ADD COLUMN IF NOT EXISTS "referringDoctor" TEXT;

-- The CRM filters on "is this patient from a partner / referred by a doctor",
-- which is a NULL test over the whole table.
CREATE INDEX IF NOT EXISTS "Patient_partnerInstitution_idx" ON "Patient" ("partnerInstitution");
CREATE INDEX IF NOT EXISTS "Patient_referringDoctor_idx" ON "Patient" ("referringDoctor");
