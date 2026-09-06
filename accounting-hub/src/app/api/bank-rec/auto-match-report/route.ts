import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { candidates, forDirection, remainingOn, recordAmountById, type Candidate } from '@/lib/bank-rec-candidates'

/**
 * POST /api/bank-rec/auto-match-report — internal ops (x-internal-secret).
 *
 * READ-ONLY sweep of the Bank Reconciliation backlog: for every PENDING
 * statement line (optionally before a cutoff), run the same candidate pool
 * the Bank Rec screen offers and report which hub records match the line's
 * amount and direction inside a ±45-day window. Interbank pairs (the same
 * amount pending on another account in the opposite direction within 5 days)
 * are reported too. Nothing is posted or marked — this is the worksheet.
 */
export async function POST(req: Request) {
  const internalSecret = process.env.NEXTAUTH_SECRET
  if (!internalSecret || req.headers.get('x-internal-secret') !== internalSecret) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { before, apply } = await req.json().catch(() => ({})) as { before?: string; apply?: boolean }
    const cutoff = before ? new Date(`${before}T23:59:59.999Z`) : new Date()

    const pending = await prisma.bankTransaction.findMany({
      where: { status: 'PENDING', date: { lte: cutoff } },
      orderBy: { date: 'asc' },
    })
    const accts = new Map(
      (await prisma.account.findMany({ where: { isBankAccount: true }, select: { id: true, accountNumber: true, accountTitle: true, currency: true } }))
        .map(a => [a.id, a]),
    )

    // One candidate pool per bank account over the whole span (cheaper than per line).
    const poolByAcct = new Map<string, Candidate[]>()
    const spanLo = pending.length ? new Date(+pending[0].date - 45 * 864e5) : new Date()
    const spanHi = new Date(+cutoff + 45 * 864e5)
    for (const acctId of new Set(pending.map(p => p.bankAccountId))) {
      poolByAcct.set(acctId, await candidates(acctId, spanLo, spanHi))
    }

    const report = []
    for (const t of pending) {
      const isSpent = Number(t.spent) > 0
      const amount = isSpent ? Number(t.spent) : Number(t.received)
      if (!(amount > 0)) continue
      const pool = forDirection(poolByAcct.get(t.bankAccountId) || [], isSpent)
      const windowed = pool.filter(c => Math.abs(+c.date - +t.date) <= 45 * 864e5 && !c.fx)
      const exact = windowed.filter(c => Math.abs(remainingOn(c, isSpent) - amount) < 0.01
        || (Math.abs(c.amount - amount) < 0.01 && remainingOn(c, isSpent) >= amount - 0.01))
      // Interbank: same amount pending in the opposite direction on another
      // same-currency account within 5 calendar days.
      const myCcy = accts.get(t.bankAccountId)?.currency || 'PHP'
      const interbank = await prisma.bankTransaction.findMany({
        where: {
          status: 'PENDING', id: { not: t.id },
          bankAccountId: { not: t.bankAccountId },
          date: { gte: new Date(+t.date - 5 * 864e5), lte: new Date(+t.date + 5 * 864e5) },
          ...(isSpent ? { received: { gte: amount - 0.01, lte: amount + 0.01 } } : { spent: { gte: amount - 0.01, lte: amount + 0.01 } }),
        },
        select: { id: true, bankAccountId: true, date: true, description: true },
      })
      const interbankSameCcy = interbank.filter(l => (accts.get(l.bankAccountId)?.currency || 'PHP') === myCcy)

      const fmt = (c: Candidate) => ({ type: c.type, id: c.id, label: c.label.slice(0, 90), date: c.date.toISOString().slice(0, 10), amount: c.amount })

      // ── apply mode: confirm the single exact match, exactly the way the
      // Bank Rec screen's match action does — POSTED + matchType/matchId, no
      // JE (the record already posted its own). A/P bills are skipped: their
      // confirmation posts a settlement JE, so they go through the screen.
      let applied: string | null = null
      if (apply && exact.length === 1) {
        const c = exact[0]
        if (c.type === 'AP_BILL') {
          applied = 'skipped — A/P bill settlement posts a JE; confirm it in Bank Reconciliation'
        } else {
          // No-double-claim: what other POSTED lines already consumed of this
          // record in this direction (mirrors the transactions PATCH check).
          const posted = await prisma.bankTransaction.findMany({
            where: {
              status: 'POSTED', id: { not: t.id },
              AND: [
                { OR: [{ matchType: null }, { matchType: { not: 'PETTY_CASH_WITHDRAWAL' } }] },
                { OR: [{ matchId: c.id }, { matchId: { contains: ',' } }] },
              ],
            },
            select: { spent: true, received: true, matchId: true },
          })
          const used = posted
            .filter(b => (b.matchId || '').split(',').some(x => x.trim() === c.id))
            .reduce((s2, b) => s2 + Number(isSpent ? b.spent : b.received), 0)
          const recordTotal = (await recordAmountById(c.id, isSpent)) ?? c.amount
          if (used + amount > recordTotal + 0.01) {
            applied = `skipped — record already matched for ${used.toFixed(2)} of ${recordTotal.toFixed(2)}`
          } else {
            await prisma.bankTransaction.update({
              where: { id: t.id },
              data: { status: 'POSTED', matchType: c.type, matchId: c.id, matchLabel: c.label.slice(0, 200), categoryAccountId: null },
            })
            applied = 'matched'
          }
        }
      }
      report.push({
        applied,
        lineId: t.id,
        date: t.date.toISOString().slice(0, 10),
        account: `${accts.get(t.bankAccountId)?.accountTitle || t.bankAccountId}`,
        description: t.description.slice(0, 70),
        direction: isSpent ? 'OUT' : 'IN',
        amount,
        verdict: exact.length === 1 ? 'EXACT' : exact.length > 1 ? 'AMBIGUOUS' : interbankSameCcy.length ? 'INTERBANK' : 'NO MATCH',
        matches: exact.slice(0, 3).map(fmt),
        interbank: interbankSameCcy.slice(0, 2).map(l => ({
          lineId: l.id, account: accts.get(l.bankAccountId)?.accountTitle, date: l.date.toISOString().slice(0, 10), description: l.description.slice(0, 60),
        })),
      })
    }
    const counts = report.reduce((m, r) => { m[r.verdict] = (m[r.verdict] || 0) + 1; return m }, {} as Record<string, number>)
    return NextResponse.json({ total: report.length, counts, lines: report })
  } catch (e) {
    console.error('auto-match-report failed', e)
    return NextResponse.json({ error: e instanceof Error ? e.message : 'Internal server error' }, { status: 500 })
  }
}
