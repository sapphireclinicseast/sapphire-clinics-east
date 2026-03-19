import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const TEMPLATE_CSV = `Account Number,Account Title,Account Type,Sub Type,Normal Balance,Description
1010,Cash on Hand,ASSET,CURRENT_ASSETS,DEBIT,Main petty cash fund
1020,Cash in Bank - BDO,ASSET,CURRENT_ASSETS,DEBIT,BDO savings account
1100,Accounts Receivable,ASSET,CURRENT_ASSETS,DEBIT,Trade receivables from patients
1200,Supplies Inventory,ASSET,CURRENT_ASSETS,DEBIT,Medical and office supplies
1500,Equipment,ASSET,PPE,DEBIT,Medical and office equipment
1600,Leasehold Improvements,ASSET,PPE,DEBIT,Clinic build-out costs
1700,Trademarks,ASSET,INTANGIBLE_ASSETS,DEBIT,Registered trademarks
2000,Accounts Payable,LIABILITY,CURRENT_LIABILITIES,CREDIT,Trade payables to suppliers
2100,Accrued Expenses,LIABILITY,CURRENT_LIABILITIES,CREDIT,Unpaid expenses at period end
2200,Withholding Tax Payable,LIABILITY,CURRENT_LIABILITIES,CREDIT,BIR withholding tax due
2500,Long-term Loans,LIABILITY,NON_CURRENT_LIABILITIES,CREDIT,Bank loans over 1 year
3000,Owner Equity,EQUITY,OWNERS_EQUITY,CREDIT,Owner capital account
3100,Retained Earnings,EQUITY,RETAINED_EARNINGS,CREDIT,Accumulated net income
4000,Service Revenue,REVENUE,OPERATING_REVENUE,CREDIT,Revenue from clinic services
4100,Product Sales,REVENUE,OPERATING_REVENUE,CREDIT,Revenue from product sales
4500,Interest Income,REVENUE,NON_OPERATING_REVENUE,CREDIT,Bank interest earned
5000,Salaries Expense,EXPENSE,OPERATING_EXPENSES,DEBIT,Employee salaries and wages
5100,Rent Expense,EXPENSE,OPERATING_EXPENSES,DEBIT,Office and clinic rent
5200,Utilities Expense,EXPENSE,OPERATING_EXPENSES,DEBIT,Electricity water and internet
5800,Bank Charges,EXPENSE,NON_OPERATING_EXPENSES,DEBIT,Service fees and charges
`

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  return new NextResponse(TEMPLATE_CSV, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="chart-of-accounts-template.csv"',
    },
  })
}
