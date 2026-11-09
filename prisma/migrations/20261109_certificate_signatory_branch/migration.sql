-- Which branch a discharge-certificate signatory belongs to.
--
-- The list is one roster shared by both clinics, so East's dialog offered
-- Greenhills' clinic manager and the other way round. 'ALL' is the existing
-- behaviour — visible everywhere — and is the right default for the rows that
-- are already there, since nobody has said yet which branch they sign for.
--
-- Guarded — the deploy replays every migration on every run.
ALTER TABLE "CertificateSignatory" ADD COLUMN IF NOT EXISTS "branch" TEXT NOT NULL DEFAULT 'ALL';
CREATE INDEX IF NOT EXISTS "CertificateSignatory_branch_idx" ON "CertificateSignatory"("branch");
