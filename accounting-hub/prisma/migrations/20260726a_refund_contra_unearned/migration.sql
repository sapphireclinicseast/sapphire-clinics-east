-- Therapy/service refunds return money that was PREPAID and never recognised as revenue.
-- They must not touch revenue: 7160 is contra-revenue and in practice holds only Verdana
-- merchandise returns, so it is retitled "Sales Returns" for clarity.
--
-- 4055 Refunds of Unearned Revenue is a contra account to 4050 Unearned Revenue: a LIABILITY
-- with a DEBIT normal balance, so debits reduce the liability on the balance sheet while
-- keeping refunds visible as their own line. Never hits the income statement.

INSERT INTO "Account" (
  id, "accountNumber", "accountTitle", "accountType", "normalBalance",
  currency, "isActive", description, "createdById", "createdAt", "updatedAt"
)
SELECT
  'acct-4055-refund-unearned', '4055', 'Refunds of Unearned Revenue', 'LIABILITY', 'DEBIT',
  'PHP', true,
  'Contra account to 4050 Unearned Revenue. Debited when a patient prepayment is refunded; nets against Unearned Revenue on the balance sheet and never touches the income statement.',
  u.id, NOW(), NOW()
FROM (SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY "createdAt" LIMIT 1) u
ON CONFLICT ("accountNumber") DO NOTHING;

-- 7160 holds merchandise returns only (product sales that WERE earned) — retitle for clarity.
UPDATE "Account"
SET "accountTitle" = 'Sales Returns', "updatedAt" = NOW()
WHERE "accountNumber" = '7160' AND "accountTitle" <> 'Sales Returns';

-- BudgetEntry persists accountKey as "<number> <title>", so keep budget rows in sync with
-- the rename (otherwise the 7160 budget line orphans and shows blank in the Budgets grid).
UPDATE "BudgetEntry"
SET "accountKey" = '7160 Sales Returns', "updatedAt" = NOW()
WHERE "accountKey" = '7160 Refunds';
