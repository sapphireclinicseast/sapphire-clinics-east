import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { computeLedgerStatements } from '@/lib/reports/v2/engine'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'INVESTOR']

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
  const cumulative = searchParams.get('cumulative') === '1'
  try {
    const statements = await computeLedgerStatements(
      year, branch,
      account ? { account, ...(month && month >= 1 && month <= 12 ? { month, ...(cumulative ? { cumulative: true } : {}) } : {}) } : undefined,
    )
    /* Investors see the subsidiary ledger — every line, every amount, so the
       ledger provably ties to the statements — but not who was treated or
       paid: patient and personnel identities are clinic-confidential. Lines
       from mechanical sources carry no person, so their labels pass through;
       everything else keeps its reference (order #, PCV, cutoff) and loses
       the free text after it. */
    if (account && (session.user.role as string) === 'INVESTOR' && statements.collected) {
      const KEEP_FULL = /^(bank-trueup|bank-opening-trueup|float-floor|period-fee|depreciation|interbranch|opening|history:)/
      statements.collected = statements.collected.map(l => {
        if (KEEP_FULL.test(l.source)) return l
        const head = l.label.split(' — ')[0].split(' | ')[0]
        return { ...l, label: head === l.label ? head : `${head} — (details withheld for privacy)` }
      })
    }
    return NextResponse.json(statements)
  } catch (err) {
    console.error('Reports v2 error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
