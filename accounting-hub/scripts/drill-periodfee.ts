import { computeLedgerStatements, type V2CollectedLine } from '../src/lib/reports/v2/engine'
const f = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
async function main() {
  const d: any = await computeLedgerStatements(2026, 'ALL', { account: '4050', cumulative: true })
  const lines: V2CollectedLine[] = (d.collected ?? []).filter((l: V2CollectedLine) => l.source.startsWith('period-fee'))
  const byM = new Map<number, { def: number; rec: number }>()
  for (const l of lines) {
    const e = byM.get(l.month) ?? { def: 0, rec: 0 }
    if (l.source === 'period-fee-deferral') e.def += l.credit - l.debit
    else e.rec += l.debit - l.credit
    byM.set(l.month, e)
  }
  console.log('month | deferred-in | released | net revenue effect | 4050 running')
  let run = 0
  for (const m of [...byM.keys()].sort((a, b) => a - b)) {
    const { def, rec } = byM.get(m)!
    run += def - rec
    console.log(`  m${String(m).padStart(2, '0')}  ${f(def).padStart(12)}  ${f(rec).padStart(12)}  ${f(rec - def).padStart(14)}  ${f(run).padStart(12)}`)
  }
  console.log('lines:', lines.length, '  deferred liability at Dec 31:', f(run))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
