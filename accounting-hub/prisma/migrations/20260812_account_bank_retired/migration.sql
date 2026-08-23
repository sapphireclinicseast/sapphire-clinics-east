-- PR #495 added Account.bankRetiredAt to schema.prisma without a migration,
-- so production's Prisma client referenced a column that never existed and
-- every prisma.account.* query failed ("The column ... does not exist"),
-- which broke all GL posting (POS orders, backfill, AR, assets).
ALTER TABLE "Account" ADD COLUMN IF NOT EXISTS "bankRetiredAt" TIMESTAMP(3);
