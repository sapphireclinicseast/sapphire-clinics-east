import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
// Which BDO checking account(s) a branch's cash sales are deposited into. SCI BDO
// carried East's early months, so East reads both.
const BDO_TITLE_PATTERNS: Record<string, string[]> = {
  SANDBOX_EAST: ['AHEA BDO Checking', 'SCI BDO Checking'],
  SANDBOX_GREENHILLS: ['AHGH BDO Checking'],
  VERDANA_STORE: ['VER BDO Checking'],
}

const round2 = (n: number) => Math.round(n * 100) / 100
const manilaDay = (d: Date) => new Date(+d + 8 * 3600_000).toISOString().slice(0, 10)
const addDays = (ymd: string, n: number) => { const d = new Date(ymd + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }

type Pay = { id: string; amount: number }

// Match BDO lump cash deposits to the day(s) of POS cash sales they cover, so
// Sales Checking can clear those cash days. Deposits lag sales 0–6 days and a
// single deposit may cover a contiguous run of up to ~14 days. Dry-run by
// default: returns the proposed matches and writes nothing. Apply creates a
// PosSettlementBatch + PosSettlementPayment links on each matched deposit (the
// line's existing categorisation/GL is left untouched — this only ties the cash
// so the day clears, exactly like the 2026-09 "crepair").
export async function POST(req: Request) {
  // Ops may run the dry-run / apply server-side with the shared secret; everyone
  // else needs a signed-in write role.
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
    const tolerance = Number.isFinite(Number(body.tolerance)) ? Number(body.tolerance) : 0.5
    const maxLagDays = Number.isFinite(Number(body.maxLagDays)) ? Number(body.maxLagDays) : 6
    const maxRunDays = Number.isFinite(Number(body.maxRunDays)) ? Number(body.maxRunDays) : 14
    const patterns = BDO_TITLE_PATTERNS[branch]
    if (!patterns) return NextResponse.json({ error: 'No BDO cash account mapped for this branch' }, { status: 400 })
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
      return NextResponse.json({ error: 'dateFrom and dateTo (YYYY-MM-DD) are required' }, { status: 400 })
    }

    const bdoAccts = await prisma.account.findMany({
      where: { OR: patterns.map(p => ({ accountTitle: { contains: p } })) }, select: { id: true },
    })
    if (!bdoAccts.length) return NextResponse.json({ error: 'BDO account not found' }, { status: 400 })
    const acctIds = bdoAccts.map(a => a.id)

    // Candidate deposit lines: money-in cash deposits on the BDO account(s), not
    // already tied to a settlement batch. SALES_DEPOSIT or still-uncategorised.
    const depLines = await prisma.bankTransaction.findMany({
      where: {
        bankAccountId: { in: acctIds }, received: { gt: 0 }, status: 'POSTED',
        date: { gte: new Date(`${dateFrom}T00:00:00+08:00`), lte: new Date(`${dateTo}T23:59:59.999+08:00`) },
        // Only deposits explicitly categorised as a cash sales deposit — never
        // interest, transfers or other uncategorised credits.
        matchType: 'SALES_DEPOSIT',
      },
      select: { id: true, date: true, received: true, description: true, matchType: true },
      orderBy: { date: 'asc' },
    })
    const already = new Set((await prisma.posSettlementBatch.findMany({
      where: { bankTransactionId: { in: depLines.map(d => d.id) } }, select: { bankTransactionId: true },
    })).map(b => b.bankTransactionId))
    const deposits = depLines.filter(d => !already.has(d.id))

    // Unlinked CASH payments per Manila day (sale day), within a run-window before dateTo.
    const lo = new Date(`${dateFrom}T00:00:00+08:00`); lo.setUTCDate(lo.getUTCDate() - maxRunDays)
    const hi = new Date(`${dateTo}T23:59:59.999+08:00`)
    const orders = await prisma.order.findMany({
      where: {
        branch, status: { notIn: ['VOIDED'] },
        OR: [{ paymentDate: { gte: lo, lte: hi } }, { paymentDate: null, transactionDate: { gte: lo, lte: hi } }],
      },
      select: { paymentDate: true, transactionDate: true, createdAt: true, payments: { where: { method: 'CASH' }, select: { id: true, amount: true } } },
    })
    const allPayIds = orders.flatMap(o => o.payments.map(p => p.id))
    const linked = allPayIds.length
      ? new Set((await prisma.posSettlementPayment.findMany({ where: { orderPaymentId: { in: allPayIds } }, select: { orderPaymentId: true } })).map(l => l.orderPaymentId))
      : new Set<string>()
    const byDay = new Map<string, { total: number; pays: Pay[] }>()
    for (const o of orders) {
      const day = manilaDay(o.paymentDate || o.transactionDate || o.createdAt)
      for (const p of o.payments) {
        if (linked.has(p.id)) continue
        let d = byDay.get(day); if (!d) { d = { total: 0, pays: [] }; byDay.set(day, d) }
        d.total = round2(d.total + Number(p.amount)); d.pays.push({ id: p.id, amount: round2(Number(p.amount)) })
      }
    }

    // Greedy: oldest deposit first, match it to a contiguous day-run whose unlinked
    // cash sums (to the centavo) to the deposit, ending within the lag window.
    const used = new Set<string>()
    type Match = { depositId: string; depositDate: string; depositAmount: number; coveredDays: string[]; matchedAmount: number; pays: Pay[] }
    const matches: Match[] = []
    for (const dep of deposits) {
      const dd = manilaDay(dep.date)
      const amt = round2(Number(dep.received))
      let best: { days: string[]; sum: number; pays: Pay[] } | null = null
      for (let lag = 0; lag <= maxLagDays && !best; lag++) {
        const L = addDays(dd, -lag)
        if (used.has(L)) continue
        let sum = 0; const days: string[] = []; const pays: Pay[] = []
        for (let span = 0; span < maxRunDays; span++) {
          const day = addDays(L, -span)
          if (used.has(day)) break
          const d = byDay.get(day)
          if (d) { sum = round2(sum + d.total); days.push(day); pays.push(...d.pays) }
          if (sum > amt + tolerance) break
          if (sum > 0 && Math.abs(sum - amt) <= tolerance) { best = { days: [...days], sum, pays: [...pays] }; break }
        }
      }
      if (best) {
        for (const day of best.days) used.add(day)
        matches.push({ depositId: dep.id, depositDate: dd, depositAmount: amt, coveredDays: [...best.days].sort(), matchedAmount: best.sum, pays: best.pays })
      }
    }

    const matchedIds = new Set(matches.map(m => m.depositId))
    const unmatchedDeposits = deposits.filter(d => !matchedIds.has(d.id))
      .map(d => ({ id: d.id, date: manilaDay(d.date), amount: round2(Number(d.received)), description: d.description }))
    const unmatchedCashDays = [...byDay.entries()].filter(([day]) => !used.has(day) && day >= dateFrom && day <= dateTo)
      .map(([day, v]) => ({ date: day, cash: v.total })).sort((a, b) => a.date.localeCompare(b.date))

    let applied = 0
    if (!dryRun && matches.length) {
      const actorId = session?.user?.id
        ?? (await prisma.user.findFirst({ where: { role: 'ADMIN' }, orderBy: { createdAt: 'asc' }, select: { id: true } }))?.id
        ?? null
      for (const m of matches) {
        try {
          await prisma.$transaction(async (tx) => {
            if (await tx.posSettlementBatch.findUnique({ where: { bankTransactionId: m.depositId }, select: { id: true } })) return
            const taken = await tx.posSettlementPayment.findMany({ where: { orderPaymentId: { in: m.pays.map(p => p.id) } }, select: { orderPaymentId: true } })
            if (taken.length) return // a payment got linked elsewhere — skip; a re-run picks it up
            await tx.posSettlementBatch.create({
              data: {
                bankTransactionId: m.depositId, paymentModeId: null,
                label: `BDO cash match (auto) — ${m.coveredDays[0]}${m.coveredDays.length > 1 ? `..${m.coveredDays[m.coveredDays.length - 1]}` : ''}`,
                grossTotal: m.matchedAmount, netTotal: m.matchedAmount,
                createdById: actorId,
                payments: { create: m.pays.map(p => ({ orderPaymentId: p.id, amount: p.amount })) },
              },
            })
          })
          applied++
        } catch (e) { console.error('BDO cash match apply error for deposit', m.depositId, e) }
      }
    }

    return NextResponse.json({
      dryRun, branch, dateFrom, dateTo,
      summary: {
        candidateDeposits: deposits.length,
        matched: matches.length,
        matchedAmount: round2(matches.reduce((a, m) => a + m.matchedAmount, 0)),
        unmatchedDeposits: unmatchedDeposits.length,
        unmatchedCashDays: unmatchedCashDays.length,
        applied,
      },
      matches: matches.map(m => ({ depositId: m.depositId, depositDate: m.depositDate, depositAmount: m.depositAmount, coveredDays: m.coveredDays, matchedAmount: m.matchedAmount, paymentCount: m.pays.length })),
      unmatchedDeposits,
      unmatchedCashDays,
    })
  } catch (e) {
    console.error('BDO cash match error:', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Failed' }, { status: 500 })
  }
}
