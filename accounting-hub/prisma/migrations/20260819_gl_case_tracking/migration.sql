-- GL case tracking: the paper trail behind a Guarantee Letter, previously kept
-- in a spreadsheet outside the app. All nullable so existing rows are valid.
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "glRequestedAmount" DECIMAL(65,30);
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "glDocsSubmittedAt" TIMESTAMP(3);
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "glReleasedAt" TIMESTAMP(3);
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "soaAmount" DECIMAL(65,30);
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "soaSubmittedAt" TIMESTAMP(3);
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "guardianName" TEXT;
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "soaCommissionRate" DECIMAL(65,30);
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "payoutBatch" TEXT;
ALTER TABLE "DigitalWallet" ADD COLUMN IF NOT EXISTS "qbEntry" TEXT;
