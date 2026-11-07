import { supplierKey } from '@/lib/supplier-directory'

// Supplier name snap (Hannah, 2026-11-07). A Registered Name typed or imported
// as a near-miss of a supplier we already have ("SHOPPEE" for SHOPEE,
// "INDUSTRIAL OFFSET PRESS" for INDUSTRIAL OFFSET PRESS INC) is saved under the
// existing supplier, so the Suppliers page never grows a second row for it.
//
// Deliberately narrow — a wrong snap files an expense under someone else:
// - the same name with spacing/punctuation/case ignored takes the saved spelling;
// - otherwise a name snaps only when exactly ONE known supplier is
//     • the same once legal-form words are dropped (INC, CORP, CO, PHILIPPINES…
//       never TRADING, STORE, SHOP or ENTERPRISES, which tell businesses apart), or
//     • one letter added or dropped (SHOPPEE, COMMUNICTIONS), or two — or one
//       swapped letter — on names of 12 letters or more; never under 6 letters.
//       A swapped letter on a short name is left alone: MARIA / MARIO SANTOS
//       are two people, not a typo;
// - a name that is already on record is never moved, so two suppliers that
//   really are different (FUNTOY / FUN TOY SHOP) stay as they are.
// Pure: used by the entry screens and by the server routes alike.

const LEGAL_FORM = new Set(['INC', 'INCORPORATED', 'CORP', 'CORPORATION', 'CO', 'COMPANY', 'LTD', 'LIMITED', 'OPC', 'PHILIPPINES', 'PHILS', 'PHIL', 'PH', 'THE'])

const coreKey = (name: string) =>
  name.toUpperCase().replace(/&/g, ' AND ').split(/[^A-Z0-9]+/).filter(w => w && !LEGAL_FORM.has(w)).join('')

// Letters added or dropped to turn one into the other (a swapped letter costs
// two), giving up once it is past `max`.
function withinEdits(a: string, b: string, max: number): boolean {
  if (Math.abs(a.length - b.length) > max) return false
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let best = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 2))
      if (cur[j] < best) best = cur[j]
    }
    if (best > max) return false
    prev = cur
  }
  return prev[b.length] <= max
}

export interface SupplierNameIndex {
  byKey: Map<string, string>
  list: { key: string; core: string; name: string }[]
}

// `known` in order of preference: the first spelling of each supplier wins
// (callers list saved suppliers before names that only appear on entries).
export function supplierNameIndex(known: Iterable<string>): SupplierNameIndex {
  const byKey = new Map<string, string>()
  const list: SupplierNameIndex['list'] = []
  for (const raw of known) {
    const name = (raw || '').replace(/\s+/g, ' ').trim()
    const key = supplierKey(name)
    if (!key || byKey.has(key)) continue
    byKey.set(key, name)
    list.push({ key, core: coreKey(name), name })
  }
  return { byKey, list }
}

export interface SnapResult {
  name: string
  // The typed name when it was moved to a different supplier's name; null when
  // it was kept or only its spacing/punctuation/case changed.
  snappedFrom: string | null
}

export function snapSupplierName(typed: string, index: SupplierNameIndex): SnapResult {
  const name = (typed || '').replace(/\s+/g, ' ').trim()
  const key = supplierKey(name)
  if (!key) return { name, snappedFrom: null }
  const same = index.byKey.get(key)
  if (same) return { name: same, snappedFrom: null }
  if (/^[0-9]+$/.test(key)) return { name, snappedFrom: null }

  const core = coreKey(name)
  const edits = key.length >= 12 ? 2 : key.length >= 6 ? 1 : 0
  const hits = index.list.filter(s =>
    (core.length >= 4 && s.core === core) ||
    (edits > 0 && s.key.length >= 6 && withinEdits(key, s.key, edits)))
  if (hits.length !== 1) return { name, snappedFrom: null }
  return { name: hits[0].name, snappedFrom: name }
}
