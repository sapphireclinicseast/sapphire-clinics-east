-- AlterTable
ALTER TABLE "ARPayment" ADD COLUMN "cashAccountId" TEXT;

-- AddForeignKey
ALTER TABLE "ARPayment" ADD CONSTRAINT "ARPayment_cashAccountId_fkey" FOREIGN KEY ("cashAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AlterEnum
ALTER TYPE "WalletAction" ADD VALUE 'AR_PAYMENT_REVERSED';
