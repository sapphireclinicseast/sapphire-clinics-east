import { computeLedgerStatements } from '../src/lib/reports/v2/engine'
const SAMPLE = process.argv.slice(2)
async function main() {
  const base: any = await computeLedgerStatements(2026, 'ALL')
  const rows: any[] = [
    ...base.balanceSheet.sections.flatMap((s: any) => s.rows),
    ...base.incomeStatement.sections.flatMap((s: any) => s.rows),
  ]
  for (const n of SAMPLE) {
    const r = rows.find(x => x.number === n)
    if (!r) { console.log(`${n}: no row`); continue }
    const d: any = await computeLedgerStatements(2026, 'ALL', { account: n, month: 12, cumulative: true })
    const m0 = (d.collected || []).filter((l: any) => l.month === 0)
    const dr = Math.round((d.collectedTotals.debit - m0.reduce((s: number, l: any) => s + l.debit, 0) - r.debit) * 100) / 100
    const cr = Math.round((d.collectedTotals.credit - m0.reduce((s: number, l: any) => s + l.credit, 0) - r.credit) * 100) / 100
    console.log(`${n} ${r.title.slice(0, 34).padEnd(34)} dDiff ${dr.toFixed(2).padStart(8)}  cDiff ${cr.toFixed(2).padStart(8)}  ${Math.abs(dr) < 0.01 && Math.abs(cr) < 0.01 ? 'TIE ✓' : 'MISMATCH'}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
