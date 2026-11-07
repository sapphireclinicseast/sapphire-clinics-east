// A CEO petty-cash entry is charged to branches through its shares, and both the
// Reports engine and the RFP builder trust the shares over the entry's own amount.
// So the shares must always add up to the entry: on 2026-10-04 a share left behind
// when the amount changed paid out ₱9,654.44 too much (Hannah, 2026-11-07).
//
// One share is always the whole entry. With several, the last one takes whatever
// the others leave, so the total can't drift while someone is typing.

export interface BranchShare { branch: string; amount: number }

const round2 = (n: number) => Math.round(n * 100) / 100
// Enough to clear floating-point noise without touching a share worked out to four
// decimals, such as the 1% card charge split by each branch's ads.
const round4 = (n: number) => Math.round(n * 10000) / 10000
const sum = (shares: BranchShare[]) => shares.reduce((t, s) => t + s.amount, 0)

/** The usable shares on an entry, whatever shape they were stored or sent in. */
export function namedShares(shares: unknown): BranchShare[] {
  return (Array.isArray(shares) ? shares : [])
    .filter(s => s?.branch)
    .map(s => ({ branch: String(s.branch), amount: Number(s.amount) || 0 }))
}

/** What is wrong with these shares for this entry amount, or null when they are fine. No shares is fine. */
export function sharesProblem(shares: unknown, gross: unknown): string | null {
  const list = namedShares(shares)
  if (!list.length) return null
  const entry = Number(gross) || 0
  if (Math.abs(sum(list) - entry) >= 0.005) {
    return `Branch shares add up to ${round2(sum(list)).toFixed(2)}, but the entry is ${round2(entry).toFixed(2)}.`
  }
  if (list.some(s => s.amount * entry < 0)) {
    return 'A branch share cannot go the opposite way from the entry.'
  }
  return null
}

/** The last share takes whatever the others leave. A single share becomes the whole entry. */
export function balanceShares(shares: unknown, gross: unknown): BranchShare[] {
  const list = namedShares(shares)
  if (!list.length) return []
  const entry = Number(gross) || 0
  const others = list.slice(0, -1)
  const last = list[list.length - 1]
  return [...others, { branch: last.branch, amount: others.length ? round4(entry - sum(others)) : entry }]
}

/** Someone typed one branch's share: keep it within what the entry has left, and the last share takes the rest. */
export function typeShare(shares: unknown, branch: string, typed: unknown, gross: unknown): BranchShare[] {
  const list = namedShares(shares)
  const entry = Number(gross) || 0
  const lastIndex = list.length - 1
  const othersUsed = list.reduce((t, s, i) => (i === lastIndex || s.branch === branch ? t : t + Math.abs(s.amount)), 0)
  const room = Math.max(0, Math.abs(entry) - othersUsed)
  const amount = Math.min(Math.abs(Number(typed) || 0), room) * (entry < 0 ? -1 : 1)
  return balanceShares(list.map(s => (s.branch === branch ? { ...s, amount } : s)), entry)
}

/** The entry's amount changed: the shares follow it, keeping their proportions. Shares that already add up stay exactly as they are. */
export function sharesForNewGross(shares: unknown, gross: unknown): BranchShare[] {
  const list = namedShares(shares)
  const entry = Number(gross) || 0
  const total = sum(list)
  if (list.length && !sharesProblem(list, entry)) return list
  if (list.length < 2 || !total) return balanceShares(list, entry)
  return balanceShares(list.map(s => ({ ...s, amount: round2(s.amount * (entry / total)) })), entry)
}
