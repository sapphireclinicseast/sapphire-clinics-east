-- Make createdById optional in WalletLog
ALTER TABLE "WalletLog" ALTER COLUMN "createdById" DROP NOT NULL;
