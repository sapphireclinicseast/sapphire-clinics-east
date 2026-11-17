import type { V2CollectedLine } from './engine'

/* Drill-down lines for viewers outside the clinic (investors, shared report
   links): every line and every amount, so the ledger provably ties to the
   statement — but not who was treated or paid. Lines from mechanical sources
   carry no person, so their labels pass through; everything else keeps its
   reference (order #, PCV, cutoff) and loses the free text after it. */
const KEEP_FULL = /^(bank-trueup|bank-opening-trueup|float-floor|period-fee|depreciation|interbranch|opening|history:)/

export function withholdLineDetails(lines: V2CollectedLine[]): V2CollectedLine[] {
  return lines.map(l => {
    if (KEEP_FULL.test(l.source)) return l
    const head = l.label.split(' — ')[0].split(' | ')[0]
    return { ...l, label: head === l.label ? head : `${head} — (details withheld for privacy)` }
  })
}
