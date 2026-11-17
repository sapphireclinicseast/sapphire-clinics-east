import { NextResponse, type NextRequest } from 'next/server'
import { prisma } from '@/lib/prisma'
import { computeLedgerStatements, type V2Statements, type V2CollectedLine } from '@/lib/reports/v2/engine'
import { withholdLineDetails } from '@/lib/reports/v2/privacy'
import { incomeStatementOnly, parseShareBranch, shareStatus } from '@/lib/reports/share'

/* PUBLIC — no login. Serves the one statement a Reports → Share link was made
   for: the link fixes the year and branches (query values for those are
   ignored or must match), drill-downs reach only the accounts on that
   statement, and entry details lose their names when the link says so.

   GET ?meta=1                      → what the link shows (counts as a view)
   GET ?branch=B                    → the income statement for one of its branches
   GET ?branch=B&account=N[&month=M] → the entries behind one amount */

export const dynamic = 'force-dynamic'

type Drill = { collected: V2CollectedLine[]; collectedTotals?: { debit: number; credit: number }; collectedTruncated?: boolean }

// Engine runs are heavy and this endpoint has no login: identical requests in
// a short window share one run (per server process). Only the trimmed
// payloads are kept, never the full statements.
const TTL_MS = 3 * 60 * 1000
const MAX_ENTRIES = 120
const cache = new Map<string, { at: number; p: Promise<unknown> }>()
function cached<T>(key: string, run: () => Promise<T>): Promise<T> {
  const now = Date.now()
  const hit = cache.get(key)
  if (hit && now - hit.at < TTL_MS) return hit.p as Promise<T>
  cache.delete(key)
  while (cache.size >= MAX_ENTRIES) cache.delete(cache.keys().next().value as string)
  const p = run()
  p.catch(() => cache.delete(key))
  cache.set(key, { at: now, p })
  return p
}

const NO_STORE = { 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' }
const fail = (error: string, status: number) => NextResponse.json({ error }, { status, headers: NO_STORE })

export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return fail('This link does not exist.', 404)
  const link = await prisma.reportShareLink.findUnique({ where: { token } })
  if (!link) return fail('This link does not exist.', 404)
  const status = shareStatus(link)
  if (status === 'revoked') return fail('This link has been turned off by the clinic.', 410)
  if (status === 'expired') return fail('This link has expired.', 410)
  const parts = parseShareBranch(link.branch)
  if (!parts || link.tab !== 'income-statement') return fail('This link does not exist.', 404)

  const sp = req.nextUrl.searchParams
  if (sp.get('meta') === '1') {
    await prisma.reportShareLink.update({
      where: { id: link.id },
      data: { viewCount: { increment: 1 }, lastViewedAt: new Date() },
    }).catch(() => {})
    return NextResponse.json({
      tab: link.tab, year: link.year, branch: link.branch, view: link.view,
      allowDrill: link.allowDrill, hideNames: link.hideNames,
      expiresAt: link.expiresAt, createdAt: link.createdAt,
    }, { headers: NO_STORE })
  }

  const branch = sp.get('branch') || (parts.length === 1 ? parts[0] : '')
  if (!parts.includes(branch)) return fail('That branch is not part of this shared report.', 400)
  const year = link.year

  try {
    const statement = await cached(`is|${year}|${branch}`,
      async () => incomeStatementOnly(await computeLedgerStatements(year, branch)))
    const account = sp.get('account')
    if (!account) return NextResponse.json(statement, { headers: NO_STORE })

    if (!link.allowDrill) return fail('Entry details are not included in this shared report.', 403)
    const onStatement = statement.incomeStatement.sections.some(s => s.rows.some(r => r.number === account))
    if (!onStatement) return fail('That account is not on this statement.', 403)
    const mp = parseInt(sp.get('month') || '')
    const month = mp >= 1 && mp <= 12 ? mp : undefined
    const drill = await cached<Drill>(`dd|${year}|${branch}|${account}|${month || ''}`, async () => {
      const s: V2Statements = await computeLedgerStatements(year, branch, { account, ...(month ? { month } : {}) })
      return { collected: s.collected || [], collectedTotals: s.collectedTotals, collectedTruncated: s.collectedTruncated }
    })
    return NextResponse.json({
      ...drill,
      collected: link.hideNames ? withholdLineDetails(drill.collected) : drill.collected,
    }, { headers: NO_STORE })
  } catch (err) {
    console.error('Shared report error:', err)
    return fail('The report could not be prepared. Please try again in a moment.', 500)
  }
}
