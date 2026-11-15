// ── Bank history: a bank account the way the bank's own app shows it ─────────
// One row per line the bank printed (not the Hub's reshaped legs), money in,
// money out, and the running balance after each line.
//
// The running balance is the figure the bank printed on the statement when the
// uploaded file carried one; otherwise it is carried forward from the line
// before. Where a printed balance disagrees with the previous balance plus this
// line's movement, the line is flagged with the difference: the Hub is missing
// a line the bank has, or holds one twice. Nothing here posts or changes data.

export interface HistorySourceLine {
  id: string
  date: Date
  description: string
  fromToName: string | null
  spent: number
  received: number
  status: string
  statementBalance: number | null
  splitFromId: string | null
  sourceRowIds: unknown
  matchLabel: string | null
  createdAt: Date
}

export interface HistoryLine {
  id: string
  date: string // YYYY-MM-DD
  description: string
  fromToName: string | null
  moneyIn: number
  moneyOut: number
  /** Balance after this line; null only when nothing anchors it. */
  balance: number | null
  /** true when `balance` is the figure the bank printed, false when carried forward. */
  printed: boolean
  /** Printed balance minus (previous balance + movement), when they differ by a centavo or more. */
  gap: number | null
  status: string
  matchLabel: string | null
  /** Switched off in Bank Rec: shown on request, never counted. */
  excluded: boolean
}

const r2 = (n: number) => Math.round(n * 100) / 100
const ymd = (d: Date) => d.toISOString().slice(0, 10)

/** Lines a reshape created (split legs, combined rows) are the Hub's, not the bank's. */
function derivedOrSourceSets(rows: HistorySourceLine[]) {
  const sources = new Set<string>()
  for (const r of rows) {
    if (r.splitFromId) sources.add(r.splitFromId)
    if (Array.isArray(r.sourceRowIds)) for (const id of r.sourceRowIds) if (typeof id === 'string') sources.add(id)
  }
  return sources
}

const key = (n: number) => Math.round(n * 100)
const move = (l: HistorySourceLine) => l.received - l.spent

/**
 * The balances a day opened and closed on, read off the bank's printed
 * figures: the close is the printed balance no other line of the day started
 * from, the open is the starting point no line of the day ended on. Lines the
 * file carried no balance for bridge the chain by their own movement. Null when
 * the figures don't pin it down to one value (no balances, or an ambiguous day).
 */
function dayEnds(day: HistorySourceLine[]): { open: number | null; close: number | null } {
  const printed = day.filter(l => l.statementBalance !== null)
  if (!printed.length) return { open: null, close: null }
  const bare = day.filter(l => l.statementBalance === null).map(move)
  const ends = new Set(printed.map(l => key(l.statementBalance as number)))
  const starts = new Set<number>()
  for (const l of printed) {
    const b = (l.statementBalance as number) - move(l)
    starts.add(key(b))
    for (const m of bare) starts.add(key(b - m))
  }
  const closes = printed.filter(l => !starts.has(key(l.statementBalance as number)))
  const opens = printed.map(l => (l.statementBalance as number) - move(l))
    .filter(b => !ends.has(key(b)) && !bare.some(m => ends.has(key(b - m))))
  const uniq = (xs: number[]) => [...new Set(xs.map(key))]
  const c = uniq(closes.map(l => l.statementBalance as number))
  const o = uniq(opens)
  return { open: o.length === 1 ? o[0] / 100 : null, close: c.length === 1 ? c[0] / 100 : null }
}

/**
 * Same-day lines in the order the bank listed them. Import order is usually
 * right, but some exports list a day newest-first, so when printed balances
 * are there the day is rebuilt by following them: each line starts where the
 * one before it ended. A line with no printed balance is slotted in where its
 * movement bridges the chain. Whatever cannot be placed keeps import order.
 */
function orderDay(day: HistorySourceLine[], start: number | null): HistorySourceLine[] {
  const left = [...day].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
  if (left.length < 2 || start === null) return left
  const out: HistorySourceLine[] = []
  let run = start
  const startsAt = (l: HistorySourceLine, at: number) =>
    l.statementBalance !== null && key((l.statementBalance as number) - move(l)) === key(at)
  while (left.length) {
    let i = left.findIndex(l => startsAt(l, run))
    if (i < 0) {
      // A bare line whose movement lands exactly where a printed line starts.
      i = left.findIndex(u => u.statementBalance === null && left.some(p => p !== u && startsAt(p, run + move(u))))
    }
    if (i < 0) { out.push(...left); break }
    const next = left.splice(i, 1)[0]
    out.push(next)
    run = next.statementBalance !== null ? (next.statementBalance as number) : run + move(next)
  }
  return out
}

export function buildHistory(all: HistorySourceLine[], opts: { includeExcluded: boolean }) {
  const sources = derivedOrSourceSets(all)
  // The bank's own lines: never a split leg or a combined row. An excluded line
  // still counts when a reshape excluded it (the bank did list it); one the
  // user switched off (a doubled upload, a line not on the statement) is left
  // out of the balance, and only shown when asked.
  const bankLines = all.filter(l => !l.splitFromId && !Array.isArray(l.sourceRowIds))
  const counted = (l: HistorySourceLine) => l.status !== 'EXCLUDED' || sources.has(l.id)

  // Group by day, oldest first.
  const byDay = new Map<string, HistorySourceLine[]>()
  for (const l of bankLines) {
    const k = ymd(l.date)
    if (!byDay.has(k)) byDay.set(k, [])
    byDay.get(k)!.push(l)
  }
  const days = [...byDay.keys()].sort()

  // Opening anchor: the balance before the first day, worked back from the
  // first day whose printed figures pin down where it opened.
  let anchor: number | null = null
  {
    let before = 0
    for (const k of days) {
      const day = byDay.get(k)!.filter(counted)
      const { open } = dayEnds(day)
      if (open !== null) { anchor = r2(open - before); break }
      before += day.reduce((s, l) => s + move(l), 0)
    }
  }

  const lines: HistoryLine[] = []
  // Each day's closing balance: the bank's own figure when the day pins one
  // down, else the balance after the last line listed.
  const dayClose: Record<string, number | null> = {}
  let run: number | null = anchor
  for (const k of days) {
    const day = byDay.get(k)!
    const live = day.filter(counted)
    const dayStart = run
    const firstIdx = lines.length
    for (const l of orderDay(live, run)) {
      const carried = run === null ? null : r2(run + move(l))
      const printed = l.statementBalance !== null
      const balance = printed ? r2(l.statementBalance as number) : carried
      run = balance
      lines.push({
        id: l.id, date: k, description: l.description, fromToName: l.fromToName,
        moneyIn: r2(l.received), moneyOut: r2(l.spent), balance, printed, gap: null,
        status: l.status, matchLabel: l.matchLabel, excluded: false,
      })
    }
    // Does the day add up? Where it closed on the bank's figures against where
    // it opened plus the day's lines. A difference means the Hub holds a line
    // the bank doesn't, or is missing one the bank has.
    let { close } = dayEnds(live)
    const net = live.reduce((s, l) => s + move(l), 0)
    const printedHere = lines.slice(firstIdx).filter(l => l.printed)
    if (close === null && printedHere.length) {
      // The bank's figures don't single out the close (two lines ending on the
      // same balance, say). If one of them is where the day's lines land, that
      // is the close; otherwise take the last printed figure and flag the day.
      const expected = dayStart === null ? null : dayStart + net
      close = expected !== null && printedHere.some(l => key(l.balance as number) === key(expected))
        ? r2(expected) : (printedHere[printedHere.length - 1].balance as number)
    }
    if (close !== null && lines.length > firstIdx) {
      if (dayStart !== null && Math.abs(close - (dayStart + net)) >= 0.01) lines[lines.length - 1].gap = r2(close - (dayStart + net))
      run = close
    }
    if (lines.length > firstIdx) dayClose[k] = run
    if (opts.includeExcluded) {
      for (const l of day.filter(x => !counted(x))) {
        lines.push({
          id: l.id, date: k, description: l.description, fromToName: l.fromToName,
          moneyIn: r2(l.received), moneyOut: r2(l.spent), balance: null, printed: false, gap: null,
          status: l.status, matchLabel: l.matchLabel, excluded: true,
        })
      }
    }
  }
  const excludedCount = bankLines.filter(l => !counted(l)).length
  return { lines, anchor, excludedCount, dayClose }
}

/** The slice of a history between two dates, with its opening and closing balances. */
export function sliceHistory(lines: HistoryLine[], anchor: number | null, dayClose: Record<string, number | null>, from: string | null, to: string | null) {
  const closeDays = Object.keys(dayClose).sort()
  let opening: number | null = anchor
  let closing: number | null = null
  for (const d of closeDays) {
    if (from && d < from) { opening = dayClose[d]; continue }
    if (to && d > to) break
    closing = dayClose[d]
  }
  const inRange = lines.filter(l => !(from && l.date < from) && !(to && l.date > to))
  const counted = inRange.filter(l => !l.excluded)
  const moneyIn = r2(counted.reduce((s, l) => s + l.moneyIn, 0))
  const moneyOut = r2(counted.reduce((s, l) => s + l.moneyOut, 0))
  const ends: Record<string, number | null> = {}
  for (const l of counted) ends[l.date] = dayClose[l.date] ?? null
  return {
    opening, closing: counted.length ? closing : opening, moneyIn, moneyOut,
    lines: inRange, dayClose: ends,
    gaps: counted.filter(l => l.gap !== null).length,
  }
}
