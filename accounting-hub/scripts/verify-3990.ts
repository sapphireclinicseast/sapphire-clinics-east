import { computeLedgerStatements, type V2CollectedLine } from '../src/lib/reports/v2/engine'
async function main() {
  const r = await computeLedgerStatements(2026, 'ALL', { account: '3990', cumulative: true })
  const lines: V2CollectedLine[] = (r as any).collected ?? []
  const byMonth = new Map<number, number>()
  for (const l of lines) byMonth.set(l.month, (byMonth.get(l.month) ?? 0) + l.credit - l.debit)
  let run = 0
  for (let m = 1; m <= 12; m++) {
    run += byMonth.get(m) ?? 0
    console.log(`m${String(m).padStart(2, '0')}  balance ${run.toFixed(2).padStart(12)}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
