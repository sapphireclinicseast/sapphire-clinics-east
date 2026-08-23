/**
 * Combine several single-branch ledger-engine payloads into one, by summation.
 *
 * Used by the income-statement branch tickboxes: ticking a subset of branches
 * fetches each branch's derived statement and sums them. Numbers add, numeric
 * arrays (monthly columns) add element-wise, row lists merge by account
 * number / section key, and everything non-numeric keeps the first payload's
 * value. Only the income statement is merged — the balance sheet and cash
 * flow are whole-company statements and never render from a merged payload.
 */

type AnyRec = Record<string, unknown>

function keyOf(o: unknown): string | undefined {
  if (!o || typeof o !== 'object') return undefined
  const r = o as AnyRec
  const k = r.number ?? r.key ?? r.label
  return typeof k === 'string' ? k : undefined
}

function sumInto(a: unknown, b: unknown): unknown {
  if (typeof a === 'number' && typeof b === 'number') return a + b
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.every(x => typeof x === 'number') && b.every(x => typeof x === 'number')) {
      const n = Math.max(a.length, b.length)
      return Array.from({ length: n }, (_, i) => ((a[i] as number) || 0) + ((b[i] as number) || 0))
    }
    const out = (a as unknown[]).map(o => (o && typeof o === 'object' ? { ...(o as AnyRec) } : o))
    for (const ob of b as unknown[]) {
      const k = keyOf(ob)
      const idx = k === undefined ? -1 : out.findIndex(o => keyOf(o) === k)
      if (idx >= 0) out[idx] = sumInto(out[idx], ob)
      else out.push(ob)
    }
    return out
  }
  if (a && b && typeof a === 'object' && typeof b === 'object') {
    const out: AnyRec = { ...(a as AnyRec) }
    for (const k of Object.keys(b as AnyRec)) {
      out[k] = k in out ? sumInto(out[k], (b as AnyRec)[k]) : (b as AnyRec)[k]
    }
    return out
  }
  return a ?? b
}

export function mergeLedgerStatements<T extends AnyRec>(payloads: T[], branchLabels?: string[]): T {
  if (payloads.length === 1) return payloads[0]
  const base = JSON.parse(JSON.stringify(payloads[0])) as T & {
    incomeStatement?: unknown
    validation?: { notes?: string[] }
    branch?: string
  }
  let is = base.incomeStatement
  for (const p of payloads.slice(1)) is = sumInto(is, (p as AnyRec).incomeStatement)
  base.incomeStatement = is
  if (branchLabels?.length) base.branch = branchLabels.join(' + ')
  if (base.validation) {
    base.validation.notes = [
      `Combined view — the sum of ${branchLabels?.join(' + ') || 'the ticked branches'}' derived income statements. Company-wide entries not tagged to a single branch appear only in the All Branches view.`,
      ...(base.validation.notes || []),
    ]
  }
  return base as T
}
