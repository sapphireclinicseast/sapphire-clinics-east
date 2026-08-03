// A rule matches a PENDING bank line when its pattern appears (case-
// insensitively) in the description or the payee, the direction agrees, and
// the account scope (if any) agrees. First matching rule wins, in creation
// order — write the specific rule before the broad one.
export type BankRuleShape = {
  bankAccountId: string | null
  direction: string
  pattern: string
}

export function ruleMatches(
  r: BankRuleShape,
  t: { description: string; fromToName: string | null; spent: unknown; received: unknown; bankAccountId: string },
): boolean {
  if (r.bankAccountId && r.bankAccountId !== t.bankAccountId) return false
  const out = Number(t.spent) > 0
  if (r.direction === 'OUT' && !out) return false
  if (r.direction === 'IN' && out) return false
  const hay = `${t.description} ${t.fromToName || ''}`.toLowerCase()
  return hay.includes(r.pattern.toLowerCase())
}

/* ── Apply active rules to PENDING lines ──────────────────────────────
   One implementation for the Apply button and for auto-apply after an
   upload, so the two can never drift. Each match posts the exact JE the
   manual categorise posts. Foreign-currency lines are skipped (a rate is
   a per-line judgment), as are self-categorisations and lines dated
   before a rule's effectiveFrom. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function applyBankRules(prisma: any, userId: string, opts: { ruleId?: string; importBatch?: string; dryRun?: boolean; cap?: number } = {}) {
  const cap = opts.cap ?? 500
  const rules = await prisma.bankCategoryRule.findMany({
    where: { active: true, ...(opts.ruleId ? { id: opts.ruleId } : {}) },
    orderBy: { createdAt: 'asc' },
  })
  if (!rules.length) return { posted: 0, skippedFx: 0, skippedSelf: 0, capped: false, perRule: {}, errors: [] as string[] }
  const pending = await prisma.bankTransaction.findMany({
    where: { status: 'PENDING', ...(opts.importBatch ? { importBatch: opts.importBatch } : {}) },
    orderBy: { date: 'asc' },
  })
  const currencies = new Map<string, string>(
    (await prisma.account.findMany({
      where: { id: { in: [...new Set(pending.map((t: { bankAccountId: string }) => t.bankAccountId))] } },
      select: { id: true, currency: true },
    })).map((a: { id: string; currency: string | null }) => [a.id, a.currency || 'PHP']),
  )
  let posted = 0, skippedFx = 0, skippedSelf = 0
  const perRule: Record<string, number> = {}
  const errors: string[] = []
  for (const txn of pending) {
    if (posted >= cap) break
    const rule = rules.find((r: BankRuleShape & { id: string; categoryAccountId: string; fromToName: string | null; effectiveFrom: Date | null }) =>
      ruleMatches(r, txn) && (!r.effectiveFrom || txn.date >= r.effectiveFrom))
    if (!rule) continue
    if (rule.categoryAccountId === txn.bankAccountId) { skippedSelf++; continue }
    if ((currencies.get(txn.bankAccountId) || 'PHP') !== 'PHP') { skippedFx++; continue }
    const isSpent = Number(txn.spent) > 0
    const amount = isSpent ? Number(txn.spent) : Number(txn.received)
    if (!(amount > 0)) continue
    perRule[rule.id] = (perRule[rule.id] || 0) + 1
    if (opts.dryRun) { posted++; continue }
    try {
      const lines = isSpent
        ? [{ accountId: rule.categoryAccountId, debit: amount, credit: 0 }, { accountId: txn.bankAccountId, debit: 0, credit: amount }]
        : [{ accountId: txn.bankAccountId, debit: amount, credit: 0 }, { accountId: rule.categoryAccountId, debit: 0, credit: amount }]
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await prisma.$transaction(async (tx: any) => {
        const created = await tx.journalEntry.create({
          data: {
            entryDate: txn.date,
            description: `Bank: ${txn.description} (rule: ${rule.pattern})`,
            referenceType: 'BANK_REC', referenceId: txn.id,
            totalAmount: amount, createdById: userId,
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
      errors.push(`${txn.date.toISOString().slice(0, 10)} ${String(txn.description).slice(0, 40)}: ${e instanceof Error ? e.message : 'failed'}`)
      if (errors.length >= 5) break
    }
  }
  return { posted, skippedFx, skippedSelf, capped: posted >= cap, perRule, errors }
}
