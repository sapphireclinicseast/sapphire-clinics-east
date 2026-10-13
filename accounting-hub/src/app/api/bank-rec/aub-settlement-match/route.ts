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

type Pay = { id: string; gross: number; net: number; netCents: number }
type Line = { id: string; date: Date; received: number; recvCents: number; acctId: string; claimed: boolean }

// 0/1-knapsack reachability over payment net-cents: return a subset of `items`
// whose net-cents sum to `target` (±tolCents), or null. Parent-pointer DP keeps
// memory light; a cap bails out on pathological fan-out (treated as "no exact
// partition", so the day is left unmatched rather than mis-linked).
function subsetSumCents(items: { idx: number; cents: number }[], target: number, tolCents: number): number[] | null {
  if (target < -tolCents) return null
  const reach = new Map<number, { prev: number; idx: number } | null>([[0, null]])
  for (const it of items) {
    for (const s of [...reach.keys()]) {
      const ns = s + it.cents
      if (ns > target + tolCents) continue
      if (!reach.has(ns)) reach.set(ns, { prev: s, idx: it.idx })
    }
    if (reach.size > 300_000) return null
  }
  let hit: number | null = null
  for (let d = 0; d <= tolCents && hit === null; d++) {
    if (reach.has(target + d)) hit = target + d
    else if (target - d >= 0 && reach.has(target - d)) hit = target - d
  }
  if (hit === null) return null
  const out: number[] = []
  let cur = hit
  while (cur !== 0) {
    const node = reach.get(cur)
    if (!node) break
    out.push(node.idx)
    cur = node.prev
  }
  return out
}

// Partition `pays` exactly across line targets (net-cents): each line gets a
// disjoint subset summing to its received (±tolCents), every payment used.
// Returns per-target payment-index lists, or null if no exact partition exists.
function partitionExact(pays: Pay[], targets: number[], tolCents: number): number[][] | null {
  // Hardest (largest) target first; fewer ways to overshoot.
  const order = targets.map((t, i) => ({ t, i })).sort((a, b) => b.t - a.t)
  const remaining = pays.map((p, idx) => ({ idx, cents: p.netCents }))
  const result: number[][] = targets.map(() => [])
  for (let k = 0; k < order.length; k++) {
    const { t, i } = order[k]
    if (k === order.length - 1) {
      // Last line takes the remainder — but only if it actually sums to its target.
      const rest = remaining.reduce((s, r) => s + r.cents, 0)
      if (Math.abs(rest - t) > tolCents) return null
      result[i] = remaining.map(r => r.idx); break
    }
    const subsetLocal = subsetSumCents(remaining, t, tolCents)
    if (!subsetLocal) return null
    const pick = new Set(subsetLocal)
    result[i] = [...pick]
    for (let j = remaining.length - 1; j >= 0; j--) if (pick.has(remaining[j].idx)) remaining.splice(j, 1)
  }
  return result
}

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
      .map(l => ({ id: l.id, date: l.date, received: round2(Number(l.received)), recvCents: Math.round(Number(l.received) * 100), acctId: l.bankAccountId, claimed: false }))

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
        g.pays.push({ id: p.id, gross: round2(Number(p.amount)), net, netCents: Math.round(net * 100) })
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

    type Part = { lineId: string; payIdxs: number[]; gross: number; net: number }
    type Match = { day: string; channel: string; net: number; gross: number; payCount: number; lineIds: string[]; parts: Part[] }
    const matches: Match[] = []
    const TOL_CENTS = 10 // per-line centavo slack for MDR/WHT rounding across payments
    // Process groups oldest first so earlier settlements claim their lines first.
    for (const g of [...groups.values()].sort((a, b) => a.day.localeCompare(b.day) || a.channel.localeCompare(b.channel))) {
      if (g.day < dateFrom || g.day > dateTo) continue // only report/claim in-range sale days
      const tol = Math.max(1.5, g.net * 0.006)
      const cand = lines.filter(l =>
        !l.claimed && acctIds.has(l.acctId) && l.received <= g.net + tol &&
        l.date >= new Date(`${g.day}T00:00:00+08:00`) && bankingDays(new Date(`${g.day}T00:00:00+08:00`), l.date) <= maxLagDays)
        .sort((a, b) => +a.date - +b.date)
      if (!cand.length) continue
      // Accept the first line-combo (fewest lines) that both sums to the group net
      // AND admits an EXACT payment partition — each line gets a disjoint subset of
      // payments netting to its deposit. Combos that only coincidentally sum are
      // rejected (no valid partition), so a line is never mislinked to a day.
      let chosen: { combo: Line[]; parts: Part[] } | null = null
      for (const combo of combosUpTo(cand.slice(0, 14), maxLines).sort((a, b) => a.length - b.length || Math.abs(a.reduce((s, l) => s + l.received, 0) - g.net) - Math.abs(b.reduce((s, l) => s + l.received, 0) - g.net))) {
        const sum = round2(combo.reduce((s, l) => s + l.received, 0))
        if (Math.abs(sum - g.net) > tol) continue
        const part = partitionExact(g.pays, combo.map(l => l.recvCents), TOL_CENTS)
        if (!part) continue
        const parts: Part[] = combo.map((l, ci) => {
          const idxs = part[ci]
          return { lineId: l.id, payIdxs: idxs, gross: round2(idxs.reduce((s, ix) => s + g.pays[ix].gross, 0)), net: round2(idxs.reduce((s, ix) => s + g.pays[ix].net, 0)) }
        })
        // Every payment must be used exactly once.
        const used = parts.flatMap(p => p.payIdxs)
        if (used.length !== g.pays.length || new Set(used).size !== g.pays.length) continue
        chosen = { combo, parts }; break
      }
      if (!chosen) continue
      for (const l of chosen.combo) l.claimed = true
      matches.push({ day: g.day, channel: g.channel, net: g.net, gross: g.gross, payCount: g.pays.length, lineIds: chosen.combo.map(l => l.id), parts: chosen.parts })
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
        try {
          await prisma.$transaction(async (tx) => {
            const takenLine = await tx.posSettlementBatch.findMany({ where: { bankTransactionId: { in: m.lineIds } }, select: { bankTransactionId: true } })
            if (takenLine.length) return // a line got claimed elsewhere — a re-run picks up the rest
            const takenPay = await tx.posSettlementPayment.findMany({ where: { orderPaymentId: { in: g.pays.map(p => p.id) } }, select: { orderPaymentId: true } })
            if (takenPay.length) return
            for (let ci = 0; ci < m.parts.length; ci++) {
              const part = m.parts[ci]
              if (!part.payIdxs.length) continue
              const label = `AUB settlement (auto) — ${part.payIdxs.length} × ${m.channel} on ${m.day} · ₱${part.gross.toLocaleString('en-PH', { minimumFractionDigits: 2 })} gross, ₱${part.net.toLocaleString('en-PH', { minimumFractionDigits: 2 })} net${m.parts.length > 1 ? ` (MID ${ci + 1}/${m.parts.length})` : ''}`
              await tx.posSettlementBatch.create({
                data: {
                  bankTransactionId: part.lineId, paymentModeId: null, label,
                  grossTotal: part.gross, netTotal: part.net, createdById: actorId,
                  payments: { create: part.payIdxs.map(ix => ({ orderPaymentId: g.pays[ix].id, amount: g.pays[ix].gross })) },
                },
              })
              await tx.bankTransaction.update({
                where: { id: part.lineId },
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
      matches: matches.slice(0, 60).map(m => ({
        day: m.day, channel: m.channel, net: m.net, payCount: m.payCount,
        lines: m.parts.map(p => ({ net: p.net, payCount: p.payIdxs.length })),
      })),
      unmatchedLines: unmatchedLines.slice(0, 60),
      unmatchedGroups: unmatchedGroups.slice(0, 60),
    })
  } catch (e) {
    console.error('AUB settlement match error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
