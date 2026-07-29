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
  if (year <= 2025) {
    return NextResponse.json({ error: 'Years up to 2025 are served by the manual statements — the ledger engine starts with 2026.' }, { status: 400 })
  }
  try {
    const statements = await computeLedgerStatements(year, branch)
    return NextResponse.json(statements)
  } catch (err) {
    console.error('Reports v2 error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
