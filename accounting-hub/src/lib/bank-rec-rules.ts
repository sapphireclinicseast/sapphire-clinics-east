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
