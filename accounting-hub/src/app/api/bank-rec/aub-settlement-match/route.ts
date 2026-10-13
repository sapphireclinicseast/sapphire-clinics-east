import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// The AUB checking account(s) each branch's card/QR terminal batches settle into.
// (VER's CNY account is foreign-currency and never a card/QR settlement target.)
const AUB_TITLE_PATTERNS: Record<string, string[]> = {
  SANDBOX_EAST: ['AHEA AUB Checking'],
  SANDBOX_GREENHILLS: ['AHGH AUB Checking'],
  VERDANA_STORE: ['VER AUB Checking'],
}
// POS methods that settle through the AUB terminals.
const SETTLEMENT_METHODS = ['CREDIT_CARD', 'DEBIT', 'GCASH', 'PAYMAYA']

const round2 = (n: number) => Math.round(n * 100) / 100
const manilaDay = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10)
const bankingDays = (a: Date, b: Date) => {
  let n = 0
  const d = new Date(Math.min(+a, +b)); const end = new Date(Math.max(+a, +b))
  while (d < end) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++ }
  return n
}

type Pay = { id: string; amount: number }
type Batch = { day: string; modeId: string; modeName: string; acctId: string; gross: number; net: number; pays: Pay[]; claimed: boolean }

// Match AUB terminal settlement deposits to the POS card/QR takings they settle,
// so Sales Checking's "Bank reconciled?" ticks turn on. A day's takings on one
// mode settle as a single net deposit 0-5 banking days later (cards usually T+1).
// Dry-run by default: returns the proposed matches and writes nothing. Apply
// creates a PosSettlementBatch + PosSettlementPayment links on each matched bank
// line and tags the line POS_SETTLEMENT — NO journal posts, because the POS
// order already booked the money into the AUB account at sale time; this only
// ties the payments so the day clears (same shape as the BDO cash matcher).
//
// Net basis: gross − the mode's own deductions (MDR) − gross×whtRate (the 0.5%
// creditable withholding the acquirer nets out of the deposit). whtRate is a
// param so the exact basis can be confirmed with a dry-run before applying.
export async function POST(req: Request) {
  const internalSecret = process.env.NEXTAUTH_SECRET
  const isInternal = Boolean(internalSecret) && req.headers.get('x-internal-secret') === internalSecret
  const session = isInternal ? null : await auth()
  if (!isInternal && (!session?.user || !WRITE_ROLES.includes(session.user.role as string))) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const branch = String(body.branch || '')
    const dateFrom = String(body.dateFrom || '')
    const dateTo = String(body.dateTo || '')
    const dryRun = body.dryRun !== false // default true — never write unless explicitly dryRun:false
    const maxLagDays = Number.isFinite(Number(body.maxLagDays)) ? Number(body.maxLagDays) : 5
    const whtRate = Number.isFinite(Number(body.whtRate)) ? Number(body.whtRate) : 0.005
    const patterns = AUB_TITLE_PATTERNS[branch]
    if (!patterns) return NextResponse.json({ error: 'No AUB account mapped for this branch' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json({ error: 'dateFrom and dateTo (YYYY-MM-DD) are required' }, { status: 400 })
    }

    const aubAccts = await prisma.account.findMany({
      where: { OR: patterns.map(p => ({ accountTitle: { contains: p } })) }, select: { id: true },
    })
    if (!aubAccts.length) return NextResponse.json({ error: 'AUB account not found' }, { status: 400 })
    const acctIds = new Set(aubAccts.map(a => a.id))

    // Settlement payment modes feeding these AUB account(s), with their MDR deductions.
    const modesRaw = await prisma.paymentMode.findMany({
      where: { OR: [{ settlementBankAccountId: { in: [...acctIds] } }, { accountId: { in: [...acctIds] } }] },
      select: { id: true, name: true, accountId: true, settlementBankAccountId: true, paymentMethod: true,
        deductions: { select: { rate: true, valueType: true } } },
    })
    const modes = modesRaw.filter(m => SETTLEMENT_METHODS.includes(String(m.paymentMethod)))
    if (!modes.length) return NextResponse.json({ error: 'No settlement payment modes map to this AUB account' }, { status: 400 })
    const modeById = new Map(modes.map(m => [m.id, m]))
    const aubAcctOfMode = (m: typeof modes[number]) =>
      (m.settlementBankAccountId && acctIds.has(m.settlementBankAccountId)) ? m.settlementBankAccountId : m.accountId!
    // Net the acquirer credits for one payment: gross − MDR (mode deductions) − WHT.
    const netOf = (modeId: string, gross: number) => {
      const m = modeById.get(modeId)!
      const mdr = (m.deductions || []).reduce((s, d) =>
        s + (d.valueType === 'FIXED' ? Number(d.rate) : gross * Number(d.rate) / 100), 0)
      const wht = gross * whtRate
      return round2(gross - mdr - wht)
    }

    // Candidate bank lines: uncategorised money-in on the AUB account(s), not yet
    // tied to a settlement batch. (matchType null skips transfers/interest, which
    // carry their own matchType.)
    const lines = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId: { in: [...acctIds] }, received: { gt: 0 }, matchType: null,
        date: { gte: new Date(`${dateFrom}T00:00:00+08:00`), lte: new Date(`${dateTo}T23:59:59.999+08:00`) },
      },
      select: { id: true, date: true, received: true, description: true, bankAccountId: true },
      orderBy: { date: 'asc' },
    })
    if (!lines.length) return NextResponse.json({ success: true, dryRun, branch, matched: 0, note: 'No uncategorised money-in lines on the AUB account(s) in range' })
    const alreadyBatched = new Set((await prisma.posSettlementBatch.findMany({
      where: { bankTransactionId: { in: lines.map(l => l.id) } }, select: { bankTransactionId: true },
    })).map(b => b.bankTransactionId))
    const candidates = lines.filter(l => !alreadyBatched.has(l.id))

    // Unlinked settlement payments in a window reaching maxLag+3 days before dateFrom.
    const lo = new Date(`${dateFrom}T00:00:00+08:00`); lo.setUTCDate(lo.getUTCDate() - (maxLagDays + 3))
    const hi = new Date(`${dateTo}T23:59:59.999+08:00`)
    const orders = await prisma.order.findMany({
      where: {
        branch, status: { notIn: ['VOIDED'] },
        OR: [{ paymentDate: { gte: lo, lte: hi } }, { paymentDate: null, transactionDate: { gte: lo, lte: hi } }],
      },
      select: {
        paymentDate: true, transactionDate: true, createdAt: true,
        payments: { where: { paymentModeId: { in: modes.map(m => m.id) } }, select: { id: true, amount: true, paymentModeId: true } },
      },
    })
    const allPayIds = orders.flatMap(o => o.payments.map(p => p.id))
    const linked = allPayIds.length
      ? new Set((await prisma.posSettlementPayment.findMany({ where: { orderPaymentId: { in: allPayIds } }, select: { orderPaymentId: true } })).map(l => l.orderPaymentId))
      : new Set<string>()

    // Group unlinked payments into (sale-day × mode) batches with their net.
    const batches = new Map<string, Batch>()
    for (const o of orders) {
      const day = manilaDay(o.transactionDate || o.paymentDate || o.createdAt)
      for (const p of o.payments) {
        if (!p.paymentModeId || linked.has(p.id)) continue
        const m = modeById.get(p.paymentModeId); if (!m) continue
        const k = `${day}|${p.paymentModeId}`
        let b = batches.get(k)
        if (!b) { b = { day, modeId: p.paymentModeId, modeName: m.name, acctId: aubAcctOfMode(m), gross: 0, net: 0, pays: [], claimed: false }; batches.set(k, b) }
        b.gross = round2(b.gross + Number(p.amount))
        b.net = round2(b.net + netOf(p.paymentModeId, Number(p.amount)))
        b.pays.push({ id: p.id, amount: round2(Number(p.amount)) })
      }
    }

    // One bank line ↔ one (day × mode) batch: same AUB account, net within
    // tolerance, settled 0-maxLag banking days after the sale day. Prefer the
    // batch whose lag is nearest the typical ~1.5 days.
    type Match = { lineId: string; lineDate: string; received: number; day: string; modeId: string; modeName: string; gross: number; net: number; payCount: number }
    const matches: Match[] = []
    for (const t of candidates) {
      const recv = Number(t.received)
      const tol = Math.max(1, recv * 0.005)
      const bias = (b: Batch) => Math.abs(bankingDays(new Date(b.day), t.date) - 1.5)
      const b = [...batches.values()]
        .filter(b => !b.claimed && b.acctId === t.bankAccountId && Math.abs(b.net - recv) <= tol)
        .filter(b => { const lag = bankingDays(new Date(b.day), t.date); return t.date >= new Date(b.day) && lag <= maxLagDays })
        .sort((a, b) => bias(a) - bias(b))[0]
      if (!b) continue
      b.claimed = true
      matches.push({ lineId: t.id, lineDate: manilaDay(t.date), received: round2(recv), day: b.day, modeId: b.modeId, modeName: b.modeName, gross: b.gross, net: b.net, payCount: b.pays.length })
    }

    const matchedLineIds = new Set(matches.map(m => m.lineId))
    const unmatchedLines = candidates.filter(l => !matchedLineIds.has(l.id))
      .map(l => ({ id: l.id, date: manilaDay(l.date), amount: round2(Number(l.received)), description: l.description }))
    const unmatchedBatches = [...batches.values()].filter(b => !b.claimed && b.day >= dateFrom && b.day <= dateTo)
      .map(b => ({ day: b.day, mode: b.modeName, gross: b.gross, net: b.net, payCount: b.pays.length }))
      .sort((a, b) => a.day.localeCompare(b.day))

    let applied = 0
    if (!dryRun && matches.length) {
      const actorId = session?.user?.id
        ?? (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id
        ?? null
      for (const m of matches) {
        const b = batches.get(`${m.day}|${m.modeId}`)!
        try {
          await prisma.$transaction(async (tx) => {
            if (await tx.posSettlementBatch.findUnique({ where: { bankTransactionId: m.lineId }, select: { id: true } })) return
            const taken = await tx.posSettlementPayment.findMany({ where: { orderPaymentId: { in: b.pays.map(p => p.id) } }, select: { orderPaymentId: true } })
            if (taken.length) return // a payment got claimed elsewhere — a re-run picks up the rest
            const label = `AUB settlement (auto) — ${b.pays.length} × ${m.modeName} on ${m.day} · ₱${b.gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })} gross, ₱${b.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })} net`
            const batch = await tx.posSettlementBatch.create({
              data: {
                bankTransactionId: m.lineId, paymentModeId: m.modeId, label,
                grossTotal: b.gross, netTotal: b.net, createdById: actorId,
                payments: { create: b.pays.map(p => ({ orderPaymentId: p.id, amount: p.amount })) },
              },
            })
            await tx.bankTransaction.update({
              where: { id: m.lineId },
              data: { status: 'POSTED', matchType: 'POS_SETTLEMENT', matchId: batch.id, matchLabel: label.slice(0, 200) },
            })
          })
          applied++
        } catch (e) { console.error('AUB settlement match apply error for line', m.lineId, e) }
      }
    }

    return NextResponse.json({
      dryRun, branch, dateFrom, dateTo, whtRate,
      summary: {
        candidateLines: candidates.length,
        matched: matches.length,
        matchedReceived: round2(matches.reduce((a, m) => a + m.received, 0)),
        unmatchedLines: unmatchedLines.length,
        unmatchedBatches: unmatchedBatches.length,
        applied,
      },
      matches,
      unmatchedLines,
      unmatchedBatches,
    })
  } catch (e) {
    console.error('AUB settlement match error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
