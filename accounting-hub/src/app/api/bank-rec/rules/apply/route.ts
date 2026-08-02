import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { ruleMatches } from '@/lib/bank-rec-rules'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']

// Apply the active rules to PENDING lines. Each match posts exactly the JE the
// manual categorise action posts: spent → Dr category / Cr bank; received →
// Dr bank / Cr category. Lines on foreign-currency accounts are skipped (they
// need a rate, which is a per-line decision), as are self-categorisations.
// Capped per run so a 2,000-line backlog applies in a few clicks, not one
// request that outlives its timeout.
const BATCH_CAP = 500

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => ({}))
  const dryRun = !!body.dryRun
  const onlyRuleId = body.ruleId || null

  const rules = await prisma.bankCategoryRule.findMany({
    where: { active: true, ...(onlyRuleId ? { id: onlyRuleId } : {}) },
    orderBy: { createdAt: 'asc' },
  })
  if (!rules.length) return NextResponse.json({ error: 'No active rules' }, { status: 400 })

  const pending = await prisma.bankTransaction.findMany({
    where: { status: 'PENDING' },
    orderBy: { date: 'asc' },
  })
  const currencies = new Map(
    (await prisma.account.findMany({
      where: { id: { in: [...new Set(pending.map(t => t.bankAccountId))] } },
      select: { id: true, currency: true },
    })).map(a => [a.id, a.currency || 'PHP']),
  )

  let posted = 0, skippedFx = 0, skippedSelf = 0
  const perRule = new Map<string, number>()
  const errors: string[] = []

  for (const txn of pending) {
    if (posted >= BATCH_CAP) break
    const rule = rules.find(r => ruleMatches(r, txn))
    if (!rule) continue
    if (rule.categoryAccountId === txn.bankAccountId) { skippedSelf++; continue }
    if ((currencies.get(txn.bankAccountId) || 'PHP') !== 'PHP') { skippedFx++; continue }
    const isSpent = Number(txn.spent) > 0
    const amount = isSpent ? Number(txn.spent) : Number(txn.received)
    if (!(amount > 0)) continue
    perRule.set(rule.id, (perRule.get(rule.id) || 0) + 1)
    if (dryRun) { posted++; continue }
    try {
      const lines = isSpent
        ? [{ accountId: rule.categoryAccountId, debit: amount, credit: 0 }, { accountId: txn.bankAccountId, debit: 0, credit: amount }]
        : [{ accountId: txn.bankAccountId, debit: amount, credit: 0 }, { accountId: rule.categoryAccountId, debit: 0, credit: amount }]
      await prisma.$transaction(async (tx) => {
        const created = await tx.journalEntry.create({
          data: {
            entryDate: txn.date,
            description: `Bank: ${txn.description} (rule: ${rule.pattern})`,
            referenceType: 'BANK_REC', referenceId: txn.id,
            totalAmount: amount, createdById: session.user!.id as string,
            lines: { create: lines.map(l => ({ accountId: l.accountId, debit: l.debit, credit: l.credit, description: txn.description })) },
          },
        })
        await tx.bankTransaction.update({
          where: { id: txn.id },
          data: {
            status: 'POSTED', categoryAccountId: rule.categoryAccountId, journalEntryId: created.id,
            matchType: null, matchId: null, matchLabel: null,
            ...(rule.fromToName && !txn.fromToName ? { fromToName: rule.fromToName } : {}),
          },
        })
      })
      posted++
    } catch (e) {
      errors.push(`${txn.date.toISOString().slice(0, 10)} ${txn.description.slice(0, 40)}: ${e instanceof Error ? e.message : 'failed'}`)
      if (errors.length >= 5) break
    }
  }

  return NextResponse.json({
    success: true, dryRun, posted, skippedFx, skippedSelf,
    remainingPending: Math.max(0, pending.length - posted - skippedFx - skippedSelf),
    capped: posted >= BATCH_CAP,
    perRule: Object.fromEntries(perRule),
    errors,
  })
}
