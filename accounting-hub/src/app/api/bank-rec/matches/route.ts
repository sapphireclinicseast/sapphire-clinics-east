import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { candidates, forDirection } from '@/lib/bank-rec-candidates'

const WINDOW_DAYS = 7
const FOREX_WINDOW_DAYS = 7
const near = (a: number, b: number) => Math.abs(a - b) < 0.01

// Buying foreign currency shows up as two bank lines that can never match on
// amount — money out of one account in one currency, money in to another in a
// different one. Candidates are therefore paired on direction and date, and the
// rate each pairing implies is returned so an implausible one is obvious.
type Txn = { id: string; bankAccountId: string; date: Date; description: string; spent: unknown; received: unknown }

async function forexCandidates(txn: Txn) {
  const account = await prisma.account.findUnique({
    where: { id: txn.bankAccountId }, select: { currency: true },
  })
  const isSpent = Number(txn.spent) > 0
  const amount = isSpent ? Number(txn.spent) : Number(txn.received)
  if (!amount) return []

  const lo = new Date(txn.date); lo.setUTCDate(lo.getUTCDate() - FOREX_WINDOW_DAYS)
  const hi = new Date(txn.date); hi.setUTCDate(hi.getUTCDate() + FOREX_WINDOW_DAYS + 1)

  // other bank accounts held in a different currency
  const others = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true, id: { not: txn.bankAccountId } },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true },
  })
  const cross = others.filter(a => (a.currency || 'PHP') !== (account?.currency || 'PHP'))
  if (cross.length === 0) return []

  const lines = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: { in: cross.map(a => a.id) },
      date: { gte: lo, lt: hi },
      status: 'PENDING',
      // the opposite side of the exchange
      ...(isSpent ? { received: { gt: 0 } } : { spent: { gt: 0 } }),
    },
    orderBy: { date: 'asc' },
  })

  const out = lines.map(l => {
    const acct = cross.find(a => a.id === l.bankAccountId)!
    const other = isSpent ? Number(l.received) : Number(l.spent)
    // rate is always expressed as home currency per 1 unit of the foreign one
    const home = (account?.currency || 'PHP') === 'PHP' ? amount : other
    const foreign = (account?.currency || 'PHP') === 'PHP' ? other : amount
    return {
      type: 'FOREX', id: l.id,
      label: `${acct.accountNumber} — ${acct.accountTitle} · ${l.description}`,
      date: l.date.toISOString().slice(0, 10),
      amount: other, currency: acct.currency || 'PHP',
      rate: foreign > 0 ? Number((home / foreign).toFixed(6)) : null,
    }
  })
  // same-day first, then closest — a forex pair almost always settles same-day
  out.sort((a, b) => Math.abs(+new Date(a.date) - +txn.date) - Math.abs(+new Date(b.date) - +txn.date))
  return out.slice(0, 20)
}

// GET ?txnId=... → suggested matches (already-recorded Hub records) for a bank line.
// Money-out (spent) → Fund Transfers out, paid RFPs. Money-in (received) → Fund Transfers in, sales/AR.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const txnId = new URL(req.url).searchParams.get('txnId') || ''
  if (!txnId) return NextResponse.json({ error: 'txnId is required' }, { status: 400 })
  const txn = await prisma.bankTransaction.findUnique({ where: { id: txnId } })
  if (!txn) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (new URL(req.url).searchParams.get('mode') === 'forex') {
    return NextResponse.json({ matches: await forexCandidates(txn) })
  }

  const isSpent = Number(txn.spent) > 0
  const amount = isSpent ? Number(txn.spent) : Number(txn.received)
  const lo = new Date(txn.date); lo.setUTCDate(lo.getUTCDate() - WINDOW_DAYS)
  const hi = new Date(txn.date); hi.setUTCDate(hi.getUTCDate() + WINDOW_DAYS + 1)
  // Cut-off: bank's beginning-balance start date (only consider entries on/after).
  const beg = await prisma.beginningBalance.findFirst({ where: { accountId: txn.bankAccountId, startDate: { not: null } }, orderBy: { periodYear: 'desc' } })
  const cutoff = beg?.startDate ? new Date(beg.startDate) : null
  const gte = (d: Date) => (!cutoff || d >= cutoff)

  // Every recorded source the Hub knows about, not just transfers, RFPs and
  // orders — a payment missing from this list simply looks unmatchable.
  const all = await candidates(txn.bankAccountId, lo, hi)
  const out = forDirection(all, isSpent)
    .filter(c => near(c.amount, amount) && gte(c.date))
    .map(c => ({ type: c.type, id: c.id, label: c.label, date: c.date.toISOString().slice(0, 10), amount: c.amount }))

  // Closest dates first.
  out.sort((a, b) => Math.abs(+new Date(a.date) - +txn.date) - Math.abs(+new Date(b.date) - +txn.date))
  return NextResponse.json({ matches: out.slice(0, 20) })
}
