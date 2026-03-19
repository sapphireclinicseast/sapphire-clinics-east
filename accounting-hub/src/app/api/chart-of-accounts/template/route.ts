import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const TEMPLATE_CSV = `Account Number,Account Title,Account Type,Normal Balance,Description
1010,Cash on Hand,ASSET,DEBIT,Main petty cash fund
1020,Cash in Bank - BDO,ASSET,DEBIT,BDO savings account
1100,Accounts Receivable,ASSET,DEBIT,Trade receivables from patients
1200,Supplies Inventory,ASSET,DEBIT,Medical and office supplies
1500,Equipment,ASSET,DEBIT,Medical and office equipment
2000,Accounts Payable,LIABILITY,CREDIT,Trade payables to suppliers
2100,Accrued Expenses,LIABILITY,CREDIT,Unpaid expenses at period end
2200,Withholding Tax Payable,LIABILITY,CREDIT,BIR withholding tax due
3000,Owner Equity,EQUITY,CREDIT,Owner capital account
3100,Retained Earnings,EQUITY,CREDIT,Accumulated net income
4000,Service Revenue,REVENUE,CREDIT,Revenue from clinic services
4100,Product Sales,REVENUE,CREDIT,Revenue from product sales
5000,Salaries Expense,EXPENSE,DEBIT,Employee salaries and wages
5100,Rent Expense,EXPENSE,DEBIT,Office and clinic rent
5200,Utilities Expense,EXPENSE,DEBIT,Electricity water and internet
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
