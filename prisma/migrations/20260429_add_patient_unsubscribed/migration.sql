-- AlterTable: opt-out from email campaigns
ALTER TABLE "Patient" ADD COLUMN "unsubscribed" BOOLEAN NOT NULL DEFAULT false;
