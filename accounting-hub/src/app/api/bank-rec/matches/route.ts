import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { candidates, forDirection } from '@/lib/bank-rec-candidates'
import { posSettlementShapes } from '@/lib/pos-settlement-shapes'

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

// Interbank transfer pairing: money moved between the company's own accounts
// (e.g. AUB → BDO) shows as a SPENT on one statement and a RECEIVED for the
// same amount on another. Electronic transfers land the same banking day, but
// the LCK/DEPN check transfers are deposited at the receiving bank first and
// only clear at the source 1–2 banking days later (more over a weekend), so
// the counterpart is offered from up to 3 banking days (5 calendar) away on
// either side. Confirming records one FundTransfer and posts both lines
// together (mirrors the forex pairing).
async function interbankCandidates(txn: Txn) {
  const isSpent = Number(txn.spent) > 0
  const amount = isSpent ? Number(txn.spent) : Number(txn.received)
  if (!amount) return []
  const account = await prisma.account.findUnique({ where: { id: txn.bankAccountId }, select: { currency: true } })

  const lo = new Date(txn.date); lo.setUTCDate(lo.getUTCDate() - 5)
  const hi = new Date(txn.date); hi.setUTCDate(hi.getUTCDate() + 6)

  const others = await prisma.account.findMany({
    where: { isBankAccount: true, isActive: true, id: { not: txn.bankAccountId } },
    select: { id: true, accountNumber: true, accountTitle: true, currency: true },
  })
  const sameCcy = others.filter(a => (a.currency || 'PHP') === (account?.currency || 'PHP'))
  if (sameCcy.length === 0) return []

  const lines = await prisma.bankTransaction.findMany({
    where: {
      bankAccountId: { in: sameCcy.map(a => a.id) },
      date: { gte: lo, lt: hi },
      status: 'PENDING',
      ...(isSpent ? { received: amount } : { spent: amount }),
    },
    orderBy: { date: 'asc' },
    take: 20,
  })
  // Nearest date first — with a multi-day window the same-day leg should lead.
  lines.sort((a, b) => Math.abs(+a.date - +txn.date) - Math.abs(+b.date - +txn.date))
  return lines.map(l => {
    const acct = sameCcy.find(a => a.id === l.bankAccountId)!
    return {
      type: 'INTERBANK', id: l.id,
      label: `Internal transfer ${isSpent ? '→' : '←'} ${acct.accountNumber} ${acct.accountTitle} · ${l.description}`,
      date: l.date.toISOString().slice(0, 10),
      amount,
    }
  })
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

  // Cut-off: bank's beginning-balance start date. It exists so that reconciling
  // a statement which opens at a beginning balance is not offered records that
  // balance already absorbed — but it has nothing to say about a bank line that
  // predates the cutoff itself. Those are historical statements being
  // reconciled after the fact, and applying the cutoff to them suppressed every
  // candidate the picker could have offered: with a 2026-01-01 opening balance
  // on an account whose statements run from 2024, the modal came up empty while
  // the grid went on announcing the very same match as "likely".
  const beg = await prisma.beginningBalance.findFirst({ where: { accountId: txn.bankAccountId, startDate: { not: null } }, orderBy: { periodYear: 'desc' } })
  const cutoff = beg?.startDate ? new Date(beg.startDate) : null
  const cutoffApplies = !!cutoff && new Date(txn.date) >= cutoff
  const gte = (d: Date) => (!cutoffApplies || d >= (cutoff as Date))

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

  // One deposit often covers several records — two shareholders paying ₱250,000
  // each into a single ₱500,000 line. Those parts never match on amount, so
  // they would never be suggested; offer anything smaller than the bank amount
  // in the same window as a combinable part, for the picker to tick and total.
  const chosen = new Set(out.map(c => `${c.type}-${c.id}`))
  const partials = searching ? [] : forDirection(all, isSpent)
    .filter(c => gte(c.date) && !c.fx && c.amount > 0 && c.amount < amount - 0.01
      && !chosen.has(`${c.type}-${c.id}`))
    .map(c => ({ type: c.type, id: c.id, label: c.label, date: c.date.toISOString().slice(0, 10), amount: c.amount, partial: true }))
    .sort((a, b) => Math.abs(+new Date(a.date) - +txn.date) - Math.abs(+new Date(b.date) - +txn.date))
    .slice(0, 25)

  // The mirror of a combination: ONE record settled by SEVERAL bank lines. A
  // ₱1,000,000 bond subscribed by one investor arrives as ₱10,000 on 2 June and
  // ₱990,000 on 11 June. Neither line equals the record, and the record is
  // bigger than the line, so it appears in neither list above. Offer records
  // larger than this line as part payments — matching one leaves the record
  // available for the other lines, since a match posts no entry of its own.
  const bigger = searching ? [] : forDirection(all, isSpent)
    .filter(c => gte(c.date) && !c.fx && c.amount > amount + 0.01
      && !chosen.has(`${c.type}-${c.id}`))
    .map(c => ({ type: c.type, id: c.id, label: c.label, date: c.date.toISOString().slice(0, 10), amount: c.amount, partOf: true }))
    .sort((a, b) => Math.abs(+new Date(a.date) - +txn.date) - Math.abs(+new Date(b.date) - +txn.date))
    .slice(0, 15)

  // Interbank counterpart legs surface FIRST — an equal-amount pending line on
  // another own account within the settlement day is almost always the answer.
  const interbank = (await interbankCandidates(txn))
    .filter(c => !searching || !q || c.label.toLowerCase().includes(q))

  // POS settlements — the same shapes the grid's yellow hint announces, offered
  // here as one-click confirms: a single card/e-wallet sale, or a whole day's
  // takings on one mode, both net of the mode's deductions. Confirming creates
  // the settlement batch (the pick handler posts to /api/bank-rec/pos-settlement).
  const money = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const pos: any[] = []
  if (!isSpent && amount > 0) {
    // Processor payouts (TikTok → VER BDO Checking) bundle several WEEKS of
    // sales into one deposit, so the shapes window reaches further back than
    // the ordinary candidate window. Day/single candidates still only surface
    // on an amount match, so the wider pull adds no noise.
    const posLo = new Date(txn.date); posLo.setUTCDate(posLo.getUTCDate() - 45)
    const shapes = await posSettlementShapes(txn.bankAccountId, posLo, hi)
    const closeAmt = (v: number) => Math.abs(v - amount) <= Math.min(1, Math.max(0.05, 0.02 * Math.max(v, amount)))
    for (const s of shapes.singles) {
      if (searching ? !(!q || `order #${s.orderNumber} ${s.name} ${s.modeName}`.toLowerCase().includes(q)) : !closeAmt(s.net)) continue
      pos.push({
        type: 'POS_SALE', id: s.paymentId, modeId: s.modeId, posPaymentIds: [s.paymentId],
        label: `Order #${s.orderNumber}${s.name ? ` · ${s.name}` : ''} · ${s.modeName} · net ₱${money(s.net)}`,
        date: s.date.toISOString().slice(0, 10), amount: s.net,
      })
    }
    for (const d of shapes.days) {
      if (d.n < 2) continue // a lone sale already surfaced above
      const exact = closeAmt(d.net)
      // A batch that is merely CLOSE is still worth offering with the gap named:
      // the bank sometimes charges a different MDR than the mode's configured
      // rate (e.g. a GCash payment keyed outside QRPH billed at 2% instead of
      // 1%), and the deposit is the day's batch regardless.
      const nearMiss = !exact && Math.abs(d.net - amount) <= Math.max(50, amount * 0.02)
      if (searching ? !(!q || `${d.modeName} day settlement`.toLowerCase().includes(q)) : !(exact || nearMiss)) continue
      const gap = Math.round((amount - d.net) * 100) / 100
      pos.push({
        type: 'POS_DAY', id: d.key, modeId: d.modeId, posPaymentIds: d.paymentIds,
        label: `Day settlement · ${d.n} × ${d.modeName} on ${d.date.toISOString().slice(0, 10)} · ₱${money(d.gross)} gross less ₱${money(Math.round((d.gross - d.net) * 100) / 100)} fees = net ₱${money(d.net)}`
          + (exact ? '' : ` — bank is ${gap >= 0 ? 'higher' : 'lower'} by ₱${money(Math.abs(gap))} (fees may differ, e.g. misrouted e-wallet MDR)`),
        date: d.date.toISOString().slice(0, 10), amount: d.net,
        details: d.items.map(i => `#${i.orderNumber}${i.name ? ` · ${i.name}` : ''} · ₱${money(i.net)}`),
      })
    }
    // Payout-mode period settlements: a TikTok-style payout covers everything
    // still unsettled from the oldest sale through some cutoff day, and the
    // recorded per-order settlement amounts are exact — so walk the days in
    // order and offer any prefix whose cumulative net equals the deposit.
    const payoutDays = shapes.days.filter(d => d.payout)
    const byMode = new Map<string, typeof payoutDays>()
    for (const d of payoutDays) {
      const arr = byMode.get(d.modeId) || []
      arr.push(d); byMode.set(d.modeId, arr)
    }
    for (const [modeId, ds] of byMode) {
      ds.sort((a, b) => +a.date - +b.date)
      let net = 0, gross = 0, n = 0
      const ids: string[] = []
      for (let k = 0; k < ds.length; k++) {
        const d = ds[k]
        net = Math.round((net + d.net) * 100) / 100
        gross = Math.round((gross + d.gross) * 100) / 100
        n += d.n; ids.push(...d.paymentIds)
        if (k === 0) continue // a single day already surfaced as POS_DAY
        if (searching ? !(!q || `${d.modeName} payout settlement`.toLowerCase().includes(q)) : !closeAmt(net)) continue
        pos.push({
          type: 'POS_DAY', id: `${modeId}|payout|${k}`, modeId, posPaymentIds: [...ids],
          label: `Payout settlement · ${n} × ${d.modeName} · ${ds[0].date.toISOString().slice(0, 10)} → ${d.date.toISOString().slice(0, 10)} · ₱${money(gross)} gross less ₱${money(Math.round((gross - net) * 100) / 100)} fees = net ₱${money(net)}`,
          date: d.date.toISOString().slice(0, 10), amount: net,
          details: ds.slice(0, k + 1).map(x => `${x.date.toISOString().slice(0, 10)} · ${x.n} sale(s) · net ₱${money(x.net)}`),
        })
      }
    }
    pos.sort((a, b) => Math.abs(+new Date(a.date) - +txn.date) - Math.abs(+new Date(b.date) - +txn.date))
  }

  // Exact suggestions first and capped as before; combinable parts ride along
  // separately so a long tail of small records can never crowd them out.
  return NextResponse.json({
    matches: [...interbank, ...pos, ...out].slice(0, searching ? 50 : 20),
    partials,
    bigger,
    searching,
  })
}
