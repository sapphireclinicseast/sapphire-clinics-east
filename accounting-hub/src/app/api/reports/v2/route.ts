import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { computeLedgerStatements } from '@/lib/reports/v2/engine'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()))
  const branch = searchParams.get('branch') || 'ALL'
  if (year < 2024) {
    return NextResponse.json({ error: 'The ledger engine starts with 2024 — no transaction data exists before that.' }, { status: 400 })
  }
  // Optional drill-down: return the underlying lines for one account (+month)
  const account = searchParams.get('account') || undefined
  const monthParam = searchParams.get('month')
  const month = monthParam ? parseInt(monthParam) : undefined
  try {
    const statements = await computeLedgerStatements(
      year, branch,
      account ? { account, ...(month && month >= 1 && month <= 12 ? { month } : {}) } : undefined,
    )
    return NextResponse.json(statements)
  } catch (err) {
    console.error('Reports v2 error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
