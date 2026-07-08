-- Loans & Advances: Loans section (Loan + one-time charges + payout occurrences).
CREATE TABLE IF NOT EXISTS "Loan" (
  "id" TEXT NOT NULL,
  "loanEntity" TEXT NOT NULL,
  "shareholderId" TEXT,
  "entityName" TEXT,
  "name" TEXT NOT NULL,
  "dateAcquired" TIMESTAMP(3) NOT NULL,
  "loanType" TEXT NOT NULL,
  "kindType" TEXT,
  "principalAmount" DECIMAL(65,30) NOT NULL,
  "hasInterest" BOOLEAN NOT NULL DEFAULT false,
  "interestMode" TEXT,
  "annualPct" DECIMAL(65,30),
  "termMonths" INTEGER,
  "monthlyAmortization" DECIMAL(65,30),
  "computedAnnualPct" DECIMAL(65,30),
  "totalInterest" DECIMAL(65,30),
  "maturityDate" TIMESTAMP(3),
  "proofOfDepositUrls" JSONB,
  "bankAccountId" TEXT,
  "creditAccountId" TEXT,
  "interestExpenseAccountId" TEXT,
  "payoutSchedule" TEXT,
  "payoutStartMonth" INTEGER,
  "payoutStartYear" INTEGER,
  "payoutDay" INTEGER,
  "loanAgreementUrls" JSONB,
  "pdcUrls" JSONB,
  "netAmountToDebit" DECIMAL(65,30),
  "remarks" TEXT,
  "fromCreditLineId" TEXT,
  "journalEntryId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "Loan_shareholderId_idx" ON "Loan"("shareholderId");
CREATE INDEX IF NOT EXISTS "Loan_fromCreditLineId_idx" ON "Loan"("fromCreditLineId");

CREATE TABLE IF NOT EXISTS "LoanCharge" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "date" TIMESTAMP(3) NOT NULL,
  "description" TEXT NOT NULL,
  "registeredName" TEXT,
  "vatable" TEXT,
  "amount" DECIMAL(65,30) NOT NULL,
  "siNumber" TEXT,
  "chargeAccountId" TEXT,
  "deductedFromDebit" BOOLEAN NOT NULL DEFAULT false,
  "proofUrls" JSONB,
  "pettyCashEntryId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanCharge_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoanCharge_loanId_idx" ON "LoanCharge"("loanId");

CREATE TABLE IF NOT EXISTS "LoanPayout" (
  "id" TEXT NOT NULL,
  "loanId" TEXT NOT NULL,
  "dueDate" TIMESTAMP(3) NOT NULL,
  "principalPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "interestPortion" DECIMAL(65,30) NOT NULL DEFAULT 0,
  "amount" DECIMAL(65,30) NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "paidDate" TIMESTAMP(3),
  "bankAccountId" TEXT,
  "proofUrls" JSONB,
  "emailedAt" TIMESTAMP(3),
  "journalEntryId" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "LoanPayout_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "LoanPayout_loanId_idx" ON "LoanPayout"("loanId");
CREATE INDEX IF NOT EXISTS "LoanPayout_dueDate_idx" ON "LoanPayout"("dueDate");

-- FKs (added only if missing; cascade delete children with the loan).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'LoanCharge_loanId_fkey') THEN
    ALTER TABLE "LoanCharge" ADD CONSTRAINT "LoanCharge_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints WHERE constraint_name = 'LoanPayout_loanId_fkey') THEN
    ALTER TABLE "LoanPayout" ADD CONSTRAINT "LoanPayout_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "CreditLine" (
  "id" TEXT NOT NULL,
  "entityName" TEXT NOT NULL,
  "amount" DECIMAL(65,30) NOT NULL,
  "interestPct" DECIMAL(65,30),
  "utilized" BOOLEAN NOT NULL DEFAULT false,
  "settledAt" TIMESTAMP(3),
  "settledJournalEntryId" TEXT,
  "remarks" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CreditLine_pkey" PRIMARY KEY ("id")
);
