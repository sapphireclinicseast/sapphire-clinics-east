import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { candidates, forDirection } from '@/lib/bank-rec-candidates'

const WINDOW_DAYS = 7
// A currency exchange settles within a few days of being keyed, so both the
// line-to-line pairing and a recorded exchange's legs are held to this window.
const FOREX_WINDOW_DAYS = 5
const near = (a: number, b: number) => Math.abs(a - b) < 0.01
const withinFxWindow = (a: Date, b: Date) =>
  Math.abs(+new Date(a) - +new Date(b)) <= FOREX_WINDOW_DAYS * 86_400_000

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

  // Other bank accounts held in a different currency. Where the accounts that
  // actually buy foreign currency have been marked, only those are paired —
  // the two sides of an exchange never share an amount, so there is no amount
  // check to weed out an account that merely happens to hold another currency.
  const all = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true, isForexAccount: true },
  })
  const configured = all.some(a => a.isForexAccount)
  if (configured && !all.find(a => a.id === txn.bankAccountId)?.isForexAccount) return []
  const cross = all.filter(a => a.id !== txn.bankAccountId
    && (a.currency || 'PHP') !== (account?.currency || 'PHP')
    && (!configured || a.isForexAccount))
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

  // Explicit search: ?q= filters candidate labels, ?from/?to= widen the date
  // window. Either one switches off the same-amount requirement — the point is
  // to tag a bank line to a record the suggester can't pair on amount (e.g. a
  // CNY bank debit against a PHP-converted expense entry).
  const sp = new URL(req.url).searchParams
  const q = (sp.get('q') || '').trim().toLowerCase()
  const fromStr = sp.get('from') || ''
  const toStr = sp.get('to') || ''
  const searching = !!(q || fromStr || toStr)

  let lo = new Date(txn.date); lo.setUTCDate(lo.getUTCDate() - WINDOW_DAYS)
  let hi = new Date(txn.date); hi.setUTCDate(hi.getUTCDate() + WINDOW_DAYS + 1)
  if (searching) {
    // Default the searched window wide (2024 onwards) unless narrowed explicitly.
    lo = /^\d{4}-\d{2}-\d{2}$/.test(fromStr) ? new Date(fromStr + 'T00:00:00.000Z') : new Date(Date.UTC(2024, 0, 1))
    hi = /^\d{4}-\d{2}-\d{2}$/.test(toStr) ? new Date(toStr + 'T00:00:00.000Z') : new Date()
    hi.setUTCDate(hi.getUTCDate() + 1)
  }

  // Cut-off: bank's beginning-balance start date (only consider entries on/after).
  const beg = await prisma.beginningBalance.findFirst({ where: { accountId: txn.bankAccountId, startDate: { not: null } }, orderBy: { periodYear: 'desc' } })
  const cutoff = beg?.startDate ? new Date(beg.startDate) : null
  const gte = (d: Date) => (!cutoff || d >= cutoff)

  // Every recorded source the Hub knows about, not just transfers, RFPs and
  // orders — a payment missing from this list simply looks unmatchable.
  const all = await candidates(txn.bankAccountId, lo, hi)
  // The beginning-balance cutoff protects the SUGGESTER from offering records
  // the statement can't contain — an explicit search is the user reaching for
  // exactly such a record (e.g. a 2025 supplier entry on an account whose
  // opening balance starts 2026), so the cutoff doesn't apply there.
  const out = forDirection(all, isSpent)
    .filter(c => searching
      ? (!q || c.label.toLowerCase().includes(q))
      : (gte(c.date) && near(c.amount, amount) && (!c.fx || withinFxWindow(c.date, txn.date))))
    .map(c => ({ type: c.type, id: c.id, label: c.label, date: c.date.toISOString().slice(0, 10), amount: c.amount }))

  // Closest dates first.
  out.sort((a, b) => Math.abs(+new Date(a.date) - +txn.date) - Math.abs(+new Date(b.date) - +txn.date))
  return NextResponse.json({ matches: out.slice(0, searching ? 50 : 20), searching })
}
