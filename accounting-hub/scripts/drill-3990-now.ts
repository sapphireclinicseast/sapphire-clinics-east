import { computeLedgerStatements, type V2CollectedLine } from '../src/lib/reports/v2/engine'
async function main() {
  const r: any = await computeLedgerStatements(2026, 'ALL', { account: '3990', cumulative: true })
  const lines: V2CollectedLine[] = r.collected ?? []
  let run = 0
  const byM = new Map<number, number>()
  for (const l of lines) byM.set(l.month, (byM.get(l.month) ?? 0) + l.credit - l.debit)
  for (const m of [...byM.keys()].sort((a, b) => a - b)) {
    run += byM.get(m)!
    console.log(`m${String(m).padStart(2, '0')}  mv ${byM.get(m)!.toFixed(2).padStart(12)}  bal ${run.toFixed(2).padStart(12)}`)
  }
  console.log('--- lines ---')
  for (const l of lines) console.log(`m${l.month} ${(l.credit - l.debit).toFixed(2).padStart(12)}  ${l.label.slice(0, 60)}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
