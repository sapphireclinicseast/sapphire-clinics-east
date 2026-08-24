import { computeLedgerStatements, type V2CollectedLine } from '../src/lib/reports/v2/engine'
const f = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
async function main() {
  const b = process.argv[2] || 'SANDBOX_EAST'
  const d: any = await computeLedgerStatements(2026, b, { account: '3985', cumulative: true })
  const lines: V2CollectedLine[] = d.collected ?? []
  const g = new Map<string, number>()
  for (const l of lines) g.set(`${l.source} | ${l.label.replace(/^.*— /, '').slice(0, 40)}`,
    (g.get(`${l.source} | ${l.label.replace(/^.*— /, '').slice(0, 40)}`) ?? 0) + l.credit - l.debit)
  console.log(`${b} 3985 components (${lines.length} lines):`)
  for (const [k, v] of [...g].sort((x, y) => Math.abs(y[1]) - Math.abs(x[1])))
    if (Math.abs(v) > 1000) console.log(`  ${f(v).padStart(15)}  ${k}`)
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
