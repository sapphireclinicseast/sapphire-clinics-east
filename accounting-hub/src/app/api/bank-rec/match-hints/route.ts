import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { candidates, forDirection } from '@/lib/bank-rec-candidates'

// Which bank lines look like they correspond to something already recorded in
// the Hub, so the grid can flag them instead of the user opening every row.
//
// Money in is the interesting case. A card sale does not reach the bank as the
// amount that was charged: the mode's deductions (merchant discount, withholding)
// come off first, and it lands a few days later. PaymentMode already carries both
// the bank account the net is lodged to and the deduction rules, so the expected
// deposit is calculable rather than guessed — and both shapes are checked, one
// deposit per sale and a day's takings settled together.
const WINDOW_DAYS = 5
const TOLERANCE = 1.0   // pesos; absorbs per-item rounding inside a settlement

type Hint = { kind: string; label: string; amount: number; date: string; n: number }

const KIND: Record<string, string> = {
  FUND_TRANSFER: 'Fund transfer', RFP: 'Paid RFP', ORDER: 'Sale', AR_PAYMENT: 'AR receipt',
  SALARY: 'Salaries payable', BENEFIT: 'Benefits payable', TAX: 'Tax payment',
  CASH_ADVANCE: 'Cash advance', EQUITY: 'Equity deposit',
}

const dayKey = (d: Date) => d.toISOString().slice(0, 10)
const money = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

// Card and e-wallet settlements land one or two banking days after the sale, and
// a weekend or holiday pushes them to the next one. Counting in banking days
// rather than calendar days is what makes a Friday sale settling on Tuesday read
// as normal instead of four days late. Holidays are not known here, so a run of
// non-working days only widens what counts as expected — it never excludes.
function bankingDaysBetween(from: Date, to: Date): number {
  if (+to < +from) return -bankingDaysBetween(to, from)
  let n = 0
  const d = new Date(from)
  while (dayKey(d) < dayKey(to)) {
    d.setUTCDate(d.getUTCDate() + 1)
    const wd = d.getUTCDay()
    if (wd !== 0 && wd !== 6) n++
  }
  return n
}
const within = (a: Date, b: Date) => Math.abs(+a - +b) <= WINDOW_DAYS * 86400000
const close = (a: number, b: number) => Math.abs(a - b) <= TOLERANCE

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const bankAccountId = sp.get('bankAccountId') || ''
  const status = sp.get('status') || 'PENDING'
  if (!bankAccountId) return NextResponse.json({ error: 'bankAccountId is required' }, { status: 400 })

  const txns = await prisma.bankTransaction.findMany({
    where: { bankAccountId, status },
    select: { id: true, date: true, spent: true, received: true },
  })
  if (txns.length === 0) return NextResponse.json({ hints: {} })

  const times = txns.map(t => +t.date)
  const lo = new Date(Math.min(...times) - WINDOW_DAYS * 86400000)
  const hi = new Date(Math.max(...times) + WINDOW_DAYS * 86400000)

  // ── money in: settlements expected to land in this bank account ───────────
  const modes = await prisma.paymentMode.findMany({
    where: { accountId: bankAccountId },
    select: { id: true, name: true, deductions: { select: { rate: true, valueType: true } } },
  })
  const netOf = (modeId: string, gross: number) => {
    const m = modes.find(x => x.id === modeId)
    if (!m) return gross
    const cut = m.deductions.reduce((s, d) =>
      s + (d.valueType === 'PERCENTAGE' ? gross * Number(d.rate) / 100 : Number(d.rate)), 0)
    return Math.round((gross - cut) * 100) / 100
  }

  const singles: { date: Date; label: string; amount: number }[] = []
  const batches = new Map<string, { date: Date; label: string; amount: number; gross: number; n: number }>()
  if (modes.length) {
    const payments = await prisma.orderPayment.findMany({
      where: {
        paymentModeId: { in: modes.map(m => m.id) },
        order: { status: 'COMPLETED', transactionDate: { gte: lo, lte: hi } },
      },
      select: {
        amount: true, paymentModeId: true,
        order: { select: { orderNumber: true, transactionDate: true, patientName: true } },
      },
    })
    for (const p of payments) {
      if (!p.order || !p.paymentModeId) continue
      const net = netOf(p.paymentModeId, Number(p.amount))
      const mode = modes.find(m => m.id === p.paymentModeId)!
      singles.push({
        date: p.order.transactionDate, amount: net,
        label: `Order #${p.order.orderNumber}${p.order.patientName ? ` · ${p.order.patientName}` : ''} · ${mode.name}`,
      })
      // a day's takings on one mode, settled as a single deposit
      const k = `${dayKey(p.order.transactionDate)}|${p.paymentModeId}`
      const cur = batches.get(k)
      const gross = Number(p.amount)
      if (cur) {
        cur.amount = Math.round((cur.amount + net) * 100) / 100
        cur.gross = Math.round((cur.gross + gross) * 100) / 100
        cur.n++
      } else {
        batches.set(k, { date: p.order.transactionDate, label: mode.name, amount: net, gross, n: 1 })
      }
    }
  }

  // ── the other leg of a currency exchange ──────────────────────────────────
  // Money out of a PHP account landing in an account held in another currency
  // never matches on amount, so it is easy to mistake for something to
  // categorise. Flagging it points at the Currency exchange flow instead.
  const thisAccount = await prisma.account.findUnique({
    where: { id: bankAccountId }, select: { currency: true },
  })
  const allBank = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true, isForexAccount: true },
  })
  // Only the accounts marked as taking part in forex, once any have been.
  const forexConfigured = allBank.some(a => a.isForexAccount)
  const thisTakesPart = !forexConfigured || !!allBank.find(a => a.id === bankAccountId)?.isForexAccount
  const otherCurrencyAccounts = allBank.filter(a => a.id !== bankAccountId)
  const crossIds = !thisTakesPart ? [] : otherCurrencyAccounts
    .filter(a => (a.currency || 'PHP') !== (thisAccount?.currency || 'PHP')
      && (!forexConfigured || a.isForexAccount))
    .map(a => a.id)
  const crossLines = crossIds.length
    ? await prisma.bankTransaction.findMany({
        where: { bankAccountId: { in: crossIds }, date: { gte: lo, lte: hi }, status: 'PENDING' },
        select: { bankAccountId: true, date: true, spent: true, received: true },
      })
    : []

  // ── everything else the Hub has recorded ──────────────────────────────────
  // Fund transfers, RFPs from petty cash / expenses / refunds / taxes, POS
  // orders, AR receipts, salaries and benefits, cash advances and equity
  // deposits — all from one source, so the grid flags exactly what the Match
  // picker will go on to offer.
  const recorded = await candidates(bankAccountId, lo, hi)

  const hints: Record<string, Hint> = {}
  for (const t of txns) {
    const spent = Number(t.spent), received = Number(t.received)
    const out = spent > 0
    const amount = out ? spent : received

    const hit = forDirection(recorded, out).find(c => within(c.date, t.date) && close(c.amount, amount))
    if (hit) {
      hints[t.id] = { kind: KIND[hit.type] || 'Recorded', label: hit.label, amount: hit.amount, date: dayKey(hit.date), n: 1 }
      continue
    }
    if (out) continue        // the settlement shapes below are money-in only

    // One sale settling on its own reads more clearly than a day's total, so it wins.
    const single = singles.find(s => within(s.date, t.date) && close(s.amount, received))
    if (single) {
      hints[t.id] = { kind: 'Card/e-wallet sale', label: single.label, amount: single.amount, date: dayKey(single.date), n: 1 }
      continue
    }
    const clumps = [...batches.values()]
      .filter(b => b.n > 1 && within(b.date, t.date) && close(b.amount, received))
      // T+1 and T+2 banking days are the norm, so the nearest such lag wins.
      .sort((a, b) => Math.abs(bankingDaysBetween(a.date, t.date) - 1.5) - Math.abs(bankingDaysBetween(b.date, t.date) - 1.5))
    const batch = clumps[0]
    if (batch) {
      const lag = bankingDaysBetween(batch.date, t.date)
      const fees = Math.round((batch.gross - batch.amount) * 100) / 100
      hints[t.id] = {
        kind: 'Day settlement',
        label: `${batch.n} × ${batch.label} on ${dayKey(batch.date)} · ${money(batch.gross)} gross less ${money(fees)} fees · settled T+${lag} banking day${lag === 1 ? '' : 's'}`,
        amount: batch.amount, date: dayKey(batch.date), n: batch.n,
      }
      continue
    }

    // Nothing matched exactly. A day's clump that is merely close is still worth
    // pointing at — a deposit into a cash account is the day's takings plus any
    // transfer a patient made straight to the bank and the cashier recorded as
    // cash, so it legitimately exceeds the day's sales. Naming the difference is
    // more use than saying nothing.
    const near = [...batches.values()]
      .filter(b => within(b.date, t.date) && Math.abs(b.amount - received) <= Math.max(50, received * 0.02))
      .sort((a, b) => Math.abs(a.amount - received) - Math.abs(b.amount - received))[0]
    if (near) {
      const diff = Math.round((received - near.amount) * 100) / 100
      hints[t.id] = {
        kind: 'Close to a day settlement',
        label: `${near.n} × ${near.label} on ${dayKey(near.date)} nets ${money(near.amount)} — this line is ${diff >= 0 ? 'higher' : 'lower'} by ${money(Math.abs(diff))}`,
        amount: near.amount, date: dayKey(near.date), n: near.n,
      }
    }
  }

  // Currency-exchange legs, applied last so a real settlement match wins: this
  // one is only a direction-and-date coincidence, since the two sides of an
  // exchange never share an amount.
  for (const t of txns) {
    if (hints[t.id]) continue
    const out = Number(t.spent) > 0
    const legs = crossLines.filter(l => within(l.date, t.date)
      && (out ? Number(l.received) > 0 : Number(l.spent) > 0))
    if (legs.length !== 1) continue      // ambiguous, so say nothing
    const leg = legs[0]
    const acct = otherCurrencyAccounts.find(a => a.id === leg.bankAccountId)!
    const amt = out ? Number(leg.received) : Number(leg.spent)
    hints[t.id] = {
      kind: 'Currency exchange',
      label: `${amt.toLocaleString('en-PH', { minimumFractionDigits: 2 })} ${acct.currency} on ${acct.accountNumber} — use Match › Currency exchange`,
      amount: amt, date: dayKey(leg.date), n: 1,
    }
  }

  return NextResponse.json({ hints, windowDays: WINDOW_DAYS })
}
