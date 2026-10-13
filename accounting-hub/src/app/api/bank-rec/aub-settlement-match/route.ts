import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// The AUB checking account(s) a branch's card/QR terminal batches settle into.
// (VER's CNY account is foreign-currency and never a card/QR settlement target.)
const AUB_TITLE_PATTERNS: Record<string, string[]> = {
  SANDBOX_EAST: ['AHEA AUB Checking'],
  SANDBOX_GREENHILLS: ['AHGH AUB Checking'],
  VERDANA_STORE: ['VER AUB Checking'],
}
// AUB settles two terminal channels. A day's takings on a channel settle as one
// deposit PER MERCHANT ID, so a single sale-day/channel can land as 2+ bank
// lines (both branches run two MIDs). POS methods map to channel as:
//   card = CREDIT_CARD (2.2% MDR) ; qr = DEBIT / GCASH / PAYMAYA (0% MDR)
// Both branches key terminal QR (GCash/PayMaya) and card-debit as DEBIT/qr.
const CHANNEL_OF: Record<string, 'card' | 'qr'> = { CREDIT_CARD: 'card', DEBIT: 'qr', GCASH: 'qr', PAYMAYA: 'qr' }
const SETTLEMENT_METHODS = Object.keys(CHANNEL_OF)

const round2 = (n: number) => Math.round(n * 100) / 100
const manilaDay = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10)
const bankingDays = (a: Date, b: Date) => {
  let n = 0
  const d = new Date(Math.min(+a, +b)); const end = new Date(Math.max(+a, +b))
  while (d < end) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++ }
  return n
}

type Pay = { id: string; gross: number; net: number }
type Line = { id: string; date: Date; received: number; acctId: string; claimed: boolean }

// Match AUB terminal settlement deposits to the POS card/QR takings they settle,
// so Sales Checking's "Bank reconciled?" ticks turn on. One sale-day × channel
// is covered by the set of bank lines (1 per MID) whose NETS sum to the day's
// channel net, settled 0-maxLag banking days later. Dry-run by default. Apply
// creates a PosSettlementBatch + PosSettlementPayment links on each covered bank
// line (payments partitioned across the lines) and tags the lines POS_SETTLEMENT
// — NO journal posts, because the POS order already booked the money into AUB at
// sale time; this only ties the payments so the day clears.
//
// Net basis: gross − the mode's MDR − gross×whtRate (the 0.5% creditable
// withholding the acquirer nets out). whtRate is a param to confirm with a dry-run.
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
    const maxLines = Number.isFinite(Number(body.maxLines)) ? Number(body.maxLines) : 3 // MIDs per channel/day
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

    // Settlement modes feeding these AUB account(s), with their MDR deductions.
    const modesRaw = await prisma.paymentMode.findMany({
      where: { OR: [{ settlementBankAccountId: { in: [...acctIds] } }, { accountId: { in: [...acctIds] } }] },
      select: { id: true, paymentMethod: true, deductions: { select: { rate: true, valueType: true } } },
    })
    const modes = modesRaw.filter(m => SETTLEMENT_METHODS.includes(String(m.paymentMethod)))
    if (!modes.length) return NextResponse.json({ error: 'No settlement payment modes map to this AUB account' }, { status: 400 })
    const modeById = new Map(modes.map(m => [m.id, m]))
    const netOf = (modeId: string, gross: number) => {
      const m = modeById.get(modeId)!
      const mdr = (m.deductions || []).reduce((s, d) =>
        s + (d.valueType === 'FIXED' ? Number(d.rate) : gross * Number(d.rate) / 100), 0)
      return round2(gross - mdr - gross * whtRate)
    }

    // Candidate bank lines: uncategorised money-in on the AUB account(s), not yet
    // tied to a settlement batch. (matchType null skips transfers/interest.)
    const rawLines = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId: { in: [...acctIds] }, received: { gt: 0 }, matchType: null,
        date: { gte: new Date(`${dateFrom}T00:00:00+08:00`), lte: new Date(`${dateTo}T23:59:59.999+08:00`) },
      },
      select: { id: true, date: true, received: true, bankAccountId: true },
      orderBy: { date: 'asc' },
    })
    if (!rawLines.length) return NextResponse.json({ success: true, dryRun, branch, matched: 0, note: 'No uncategorised money-in lines on the AUB account(s) in range' })
    const alreadyBatched = new Set((await prisma.posSettlementBatch.findMany({
      where: { bankTransactionId: { in: rawLines.map(l => l.id) } }, select: { bankTransactionId: true },
    })).map(b => b.bankTransactionId))
    const lines: Line[] = rawLines.filter(l => !alreadyBatched.has(l.id))
      .map(l => ({ id: l.id, date: l.date, received: round2(Number(l.received)), acctId: l.bankAccountId, claimed: false }))

    // Unlinked settlement payments grouped by (sale-day × channel).
    const lo = new Date(`${dateFrom}T00:00:00+08:00`); lo.setUTCDate(lo.getUTCDate() - (maxLagDays + 3))
    const hi = new Date(`${dateTo}T23:59:59.999+08:00`)
    const orders = await prisma.order.findMany({
      where: {
        branch, status: { notIn: ['VOIDED'] },
        OR: [{ paymentDate: { gte: lo, lte: hi } }, { paymentDate: null, transactionDate: { gte: lo, lte: hi } }],
      },
      select: {
        paymentDate: true, transactionDate: true, createdAt: true,
        payments: { where: { paymentModeId: { in: modes.map(m => m.id) } }, select: { id: true, amount: true, paymentModeId: true, method: true } },
      },
    })
    const allPayIds = orders.flatMap(o => o.payments.map(p => p.id))
    const linked = allPayIds.length
      ? new Set((await prisma.posSettlementPayment.findMany({ where: { orderPaymentId: { in: allPayIds } }, select: { orderPaymentId: true } })).map(l => l.orderPaymentId))
      : new Set<string>()

    type Group = { day: string; channel: 'card' | 'qr'; gross: number; net: number; pays: Pay[] }
    const groups = new Map<string, Group>()
    for (const o of orders) {
      // Sale day governs the settlement lag; auto-tag buckets by paymentDate, so
      // prefer it here too for the key.
      const day = manilaDay(o.paymentDate || o.transactionDate || o.createdAt)
      for (const p of o.payments) {
        if (!p.paymentModeId || linked.has(p.id)) continue
        const channel = CHANNEL_OF[String(p.method)]; if (!channel) continue
        const net = netOf(p.paymentModeId, Number(p.amount))
        const k = `${day}|${channel}`
        let g = groups.get(k)
        if (!g) { g = { day, channel, gross: 0, net: 0, pays: [] }; groups.set(k, g) }
        g.gross = round2(g.gross + Number(p.amount)); g.net = round2(g.net + net)
        g.pays.push({ id: p.id, gross: round2(Number(p.amount)), net })
      }
    }

    // Cover each (day × channel) with the smallest set of unclaimed lines (same
    // AUB account, settled 0-maxLag banking days after the day) whose receiveds
    // sum to the group net. Try 1 line, then 2, then up to maxLines.
    const combosUpTo = (arr: Line[], k: number): Line[][] => {
      const out: Line[][] = []
      const rec = (start: number, pick: Line[]) => {
        if (pick.length) out.push([...pick])
        if (pick.length === k) return
        for (let i = start; i < arr.length; i++) { pick.push(arr[i]); rec(i + 1, pick); pick.pop() }
      }
      rec(0, [])
      return out
    }

    type Match = { day: string; channel: string; net: number; gross: number; payCount: number; lineIds: string[]; lineAmts: number[] }
    const matches: Match[] = []
    // Process groups oldest first so earlier settlements claim their lines first.
    for (const g of [...groups.values()].sort((a, b) => a.day.localeCompare(b.day) || a.channel.localeCompare(b.channel))) {
      if (g.day < dateFrom || g.day > dateTo) continue // only report/claim in-range sale days
      const tol = Math.max(1.5, g.net * 0.006)
      const cand = lines.filter(l =>
        !l.claimed && acctIds.has(l.acctId) && l.received <= g.net + tol &&
        l.date >= new Date(`${g.day}T00:00:00+08:00`) && bankingDays(new Date(`${g.day}T00:00:00+08:00`), l.date) <= maxLagDays)
        .sort((a, b) => +a.date - +b.date)
      if (!cand.length) continue
      // Prefer the fewest lines, then the combo closest in total to the net.
      let best: Line[] | null = null
      for (const combo of combosUpTo(cand.slice(0, 14), maxLines).sort((a, b) => a.length - b.length)) {
        const sum = round2(combo.reduce((s, l) => s + l.received, 0))
        if (Math.abs(sum - g.net) <= tol) { best = combo; break }
      }
      if (!best) continue
      for (const l of best) l.claimed = true
      matches.push({ day: g.day, channel: g.channel, net: g.net, gross: g.gross, payCount: g.pays.length, lineIds: best.map(l => l.id), lineAmts: best.map(l => l.received) })
    }

    const claimedLineIds = new Set(matches.flatMap(m => m.lineIds))
    const unmatchedLines = lines.filter(l => !l.claimed)
      .map(l => ({ id: l.id, date: manilaDay(l.date), amount: l.received }))
    const unmatchedGroups = [...groups.values()]
      .filter(g => g.day >= dateFrom && g.day <= dateTo && !matches.some(m => m.day === g.day && m.channel === g.channel))
      .map(g => ({ day: g.day, channel: g.channel, gross: g.gross, net: g.net, payCount: g.pays.length }))
      .sort((a, b) => a.day.localeCompare(b.day))

    let applied = 0, linesPosted = 0
    if (!dryRun && matches.length) {
      const actorId = session?.user?.id
        ?? (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id
        ?? null
      for (const m of matches) {
        const g = groups.get(`${m.day}|${m.channel}`)!
        const theLines = m.lineIds.map((id, i) => ({ id, received: m.lineAmts[i] }))
        // Partition payments across the covered lines: fill the line with the most
        // remaining room first, so each batch's net ≈ its bank line's deposit.
        const buckets = theLines.map(l => ({ lineId: l.id, target: l.received, pays: [] as Pay[], gross: 0, net: 0 }))
        for (const p of [...g.pays].sort((a, b) => b.net - a.net)) {
          const b = buckets.slice().sort((x, y) => (y.target - y.net) - (x.target - x.net))[0]
          b.pays.push(p); b.gross = round2(b.gross + p.gross); b.net = round2(b.net + p.net)
        }
        try {
          await prisma.$transaction(async (tx) => {
            const takenLine = await tx.posSettlementBatch.findMany({ where: { bankTransactionId: { in: theLines.map(l => l.id) } }, select: { bankTransactionId: true } })
            if (takenLine.length) return // a line got claimed elsewhere — a re-run picks up the rest
            const takenPay = await tx.posSettlementPayment.findMany({ where: { orderPaymentId: { in: g.pays.map(p => p.id) } }, select: { orderPaymentId: true } })
            if (takenPay.length) return
            for (const b of buckets) {
              if (!b.pays.length) continue
              const label = `AUB settlement (auto) — ${b.pays.length} × ${m.channel} on ${m.day} · ₱${b.gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })} gross, ₱${b.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })} net${theLines.length > 1 ? ` (MID ${buckets.indexOf(b) + 1}/${theLines.length})` : ''}`
              await tx.posSettlementBatch.create({
                data: {
                  bankTransactionId: b.lineId, paymentModeId: null, label,
                  grossTotal: b.gross, netTotal: b.net, createdById: actorId,
                  payments: { create: b.pays.map(p => ({ orderPaymentId: p.id, amount: p.gross })) },
                },
              })
              await tx.bankTransaction.update({
                where: { id: b.lineId },
                data: { status: 'POSTED', matchType: 'POS_SETTLEMENT', matchLabel: label.slice(0, 200) },
              })
              linesPosted++
            }
          })
          applied++
        } catch (e) { console.error('AUB settlement match apply error for', m.day, m.channel, e) }
      }
    }

    return NextResponse.json({
      dryRun, branch, dateFrom, dateTo, whtRate,
      summary: {
        candidateLines: lines.length,
        matchedGroups: matches.length,
        linesCovered: claimedLineIds.size,
        matchedNet: round2(matches.reduce((a, m) => a + m.net, 0)),
        unmatchedLines: unmatchedLines.length,
        unmatchedGroups: unmatchedGroups.length,
        applied, linesPosted,
      },
      matches: matches.slice(0, 60),
      unmatchedLines: unmatchedLines.slice(0, 60),
      unmatchedGroups: unmatchedGroups.slice(0, 60),
    })
  } catch (e) {
    console.error('AUB settlement match error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
