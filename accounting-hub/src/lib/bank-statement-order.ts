// Which statement line closed the day? (Hannah 2026-11-15.)
//
// A bank statement prints a running balance on every line, and the hub reads an
// account's position — Reports' month-end cash, the cash reconciliation, the
// balance-as-of figure, the retire check — from the LAST line of a day. "Last"
// used to mean the row stored last, i.e. the order of the uploaded file. But
// BDO's "Current Day" export lists the day newest-first (its Transaction
// History export is oldest-first), so the day's first transaction was taken as
// its last: on 2026-11-15 Reports read East BDO at ₱471,420.03 instead of
// ₱134,623.19 — the balance before that day's payroll went out — and cash was
// ₱1.36M too high across the three accounts.
//
// The running balance itself says which line came last: every line's balance is
// the balance before it, less what it paid out, plus what it took in. So the
// line that closed the day is the one no other line of that day continues from.
// Prisma-free so the upload route, the ledger engine and tests can all use it.

export interface StatementLine {
  date: Date | string
  // numbers, numeric strings or Prisma Decimals
  spent: unknown
  received: unknown
  statementBalance?: unknown
}

const cents = (v: unknown) => Math.round((Number(v) || 0) * 100)
const hasBalance = (v: unknown) => v !== null && v !== undefined && v !== '' && Number.isFinite(Number(v))
/** The balance just before this line, in centavos. */
const priorCents = (l: StatementLine) => cents(l.statementBalance) + cents(l.spent) - cents(l.received)

/** UTC calendar day of a line — how statement dates are stored (midnight UTC). */
export const statementDay = (d: Date | string) => (d instanceof Date ? d : new Date(d)).toISOString().slice(0, 10)

/** Consecutive balance-carrying lines that continue from the one before (links) or don't (breaks). */
function chain(lines: StatementLine[]): { links: number; breaks: number } {
  let links = 0, breaks = 0
  for (let i = 1; i < lines.length; i++) {
    const a = lines[i - 1], b = lines[i]
    if (!hasBalance(a.statementBalance) || !hasBalance(b.statementBalance)) continue
    if (priorCents(b) === cents(a.statementBalance)) links++
    else breaks++
  }
  return { links, breaks }
}

/**
 * Put an uploaded statement in the order its transactions happened, so the rows
 * are stored — and their ids assigned — oldest first. Days go oldest first
 * (stable, so a day keeps its own order), then a day whose running balance only
 * chains when read backwards is read backwards. A day the balances can't settle
 * either way (no balances, one line, a gap) keeps the order it came in.
 */
export function chronological<T extends StatementLine>(rows: T[]): T[] {
  const sorted = rows
    .map((r, i) => ({ r, i, t: +new Date(r.date) }))
    .sort((a, b) => (a.t - b.t) || (a.i - b.i))
    .map(x => x.r)
  const out: T[] = []
  for (let i = 0; i < sorted.length;) {
    const day = statementDay(sorted[i].date)
    let j = i
    while (j < sorted.length && statementDay(sorted[j].date) === day) j++
    const group = sorted.slice(i, j)
    if (group.length > 1) {
      const fwd = chain(group)
      const rev = chain([...group].reverse())
      if (fwd.breaks > 0 && rev.breaks === 0 && rev.links > 0) group.reverse()
    }
    out.push(...group)
    i = j
  }
  return out
}

/**
 * The line that closed the day, from one account's lines on one day given in
 * their stored order. It is the balance-carrying line no other line continues
 * from. When the balances can't single one out (a day whose movements net back
 * to an earlier balance, a gap in the statement) the last line in the given
 * order stands, which is what was read before.
 */
export function closingLine<T extends StatementLine>(sameDay: T[]): T | undefined {
  const lines = sameDay.filter(l => hasBalance(l.statementBalance))
  if (lines.length <= 1) return lines[0]
  const ends = lines.filter(l => !lines.some(m => m !== l && priorCents(m) === cents(l.statementBalance)))
  return ends.length === 1 ? ends[0] : lines[lines.length - 1]
}

/**
 * The closing line of the latest day among one account's lines, given in their
 * stored order (date, then id, ascending) — that order is only the fallback.
 */
export function closingOfLatestDay<T extends StatementLine>(lines: T[]): T | undefined {
  if (!lines.length) return undefined
  let latest = statementDay(lines[0].date)
  for (const l of lines) { const d = statementDay(l.date); if (d > latest) latest = d }
  return closingLine(lines.filter(l => statementDay(l.date) === latest))
}
