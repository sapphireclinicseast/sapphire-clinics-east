-- 1) PWD/Senior-gated vouchers.
--    Such a voucher only applies when Patient CRM (Operations Hub) holds BOTH a PWD/Senior
--    ID number AND an uploaded ID photo for the payer; verified when they pay.
ALTER TABLE "Voucher" ADD COLUMN IF NOT EXISTS "requiresPwdId" BOOLEAN NOT NULL DEFAULT false;

-- The PWD voucher already in use is gated by that rule.
UPDATE "Voucher" SET "requiresPwdId" = true WHERE UPPER("code") = 'AURAPWD34AS';

-- 2) Per-branch retainers for interbranch consultants.
--    e.g. {"SBGH": 10000} for someone who consults at both branches but is retained only at
--    Greenhills. NULL keeps the old behaviour: all of monthlyRetainer on the primary branch.
ALTER TABLE "Consultant" ADD COLUMN IF NOT EXISTS "retainerByBranch" JSONB;
