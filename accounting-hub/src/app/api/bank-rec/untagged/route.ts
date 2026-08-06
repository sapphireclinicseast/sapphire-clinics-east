import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { candidates } from '@/lib/bank-rec-candidates'

// Everything the Hub has recorded that no bank line accounts for.
//
// A payment is "tagged" when a posted bank line points at it, so the untagged
// set is simply what the Hub holds minus what has been pointed at. This is the
// side of reconciliation the grid cannot show: the grid lists bank lines with
// nothing matched to them, while a record with no bank line at all appears
// nowhere and is the easier one to miss entirely.
const LABELS: Record<string, string> = {
  FUND_TRANSFER: 'Fund transfers', RFP: 'Paid RFPs', ORDER: 'POS orders',
  AR_PAYMENT: 'AR receipts', SALARY: 'Salaries payable', BENEFIT: 'Benefits payable',
  TAX: 'Tax payments', CASH_ADVANCE: 'Cash advances', EQUITY: 'Equity deposits',
  EQUITY_DEPOSIT: 'Equity deposits (itemised)',
  ADVANCE: 'Advances received',
}

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const to = sp.get('to') ? new Date(`${sp.get('to')}T23:59:59.999Z`) : new Date()
  const from = sp.get('from')
    ? new Date(`${sp.get('from')}T00:00:00.000Z`)
    : new Date(+to - 90 * 86400000)
  const onlyType = sp.get('type') || ''

  // Records the Hub holds in the window, across every bank account.
  const all = await candidates(null, from, to)

  // Anything a posted bank line already points at.
  const matched = await prisma.bankTransaction.findMany({
    where: { status: 'POSTED', matchId: { not: null } },
    select: { matchId: true, matchType: true },
  })
  const tagged = new Set(matched.map(m => `${m.matchType}|${m.matchId}`))
  // Match ids alone as well: a record tagged under a different type still counts
  // as accounted for, and flagging it again would be a false alarm.
  const taggedIds = new Set(matched.map(m => m.matchId as string))

  const untagged = all.filter(c => !tagged.has(`${c.type}|${c.id}`) && !taggedIds.has(c.id))

  const groups = Object.entries(
    untagged.reduce((acc, c) => {
      (acc[c.type] ||= []).push(c)
      return acc
    }, {} as Record<string, typeof untagged>),
  )
    .filter(([type]) => !onlyType || type === onlyType)
    .map(([type, items]) => ({
      type,
      label: LABELS[type] || type,
      count: items.length,
      total: Math.round(items.reduce((s, i) => s + i.amount, 0) * 100) / 100,
      items: items
        .sort((a, b) => +b.date - +a.date)
        .slice(0, 200)
        .map(i => ({ id: i.id, label: i.label, date: i.date.toISOString().slice(0, 10), amount: i.amount, dir: i.dir })),
      truncated: items.length > 200,
    }))
    .sort((a, b) => b.count - a.count)

  return NextResponse.json({
    from: from.toISOString().slice(0, 10), to: to.toISOString().slice(0, 10),
    totalUntagged: untagged.length,
    totalRecords: all.length,
    groups,
  })
}
