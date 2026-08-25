import { computeLedgerStatements, type V2CollectedLine } from '../src/lib/reports/v2/engine'
const f = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
async function main() {
  for (const m of [6, 7, 8, 12]) {
    const d: any = await computeLedgerStatements(2026, 'ALL', { account: '4050', month: m })
    const lines: V2CollectedLine[] = (d.collected ?? []).filter((l: V2CollectedLine) => l.source.startsWith('period-fee'))
    const def = lines.filter(l => l.source.endsWith('deferral')).reduce((s, l) => s + l.credit - l.debit, 0)
    const rec = lines.filter(l => l.source.endsWith('recognition')).reduce((s, l) => s + l.debit - l.credit, 0)
    console.log(`m${String(m).padStart(2, '0')}: deferred ${f(def)}  released ${f(rec)}  net revenue ${f(rec - def)}  (${lines.length} lines, truncated ${d.collectedTruncated})`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
