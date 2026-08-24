import { writeFileSync } from 'fs'
import { computeLedgerStatements } from '../src/lib/reports/v2/engine'
async function main() {
  const r: any = await computeLedgerStatements(2026, 'ALL')
  const dump = {
    bs: { A: r.balanceSheet.totalAssets, L: r.balanceSheet.totalLiabilities, E: r.balanceSheet.totalEquity, NI: r.balanceSheet.netIncome },
    is: { ns: r.incomeStatement.netSales, ebitda: r.incomeStatement.ebitda, ni: r.incomeStatement.netIncome },
    rows: r.balanceSheet.sections.flatMap((s: any) => s.rows.map((x: any) =>
      [x.number, x.opening, x.closing, ...(x.monthly ?? [])].join('|'))).sort(),
  }
  writeFileSync(process.argv[2], JSON.stringify(dump))
  console.log('rows:', dump.rows.length, 'A:', dump.bs.A.toFixed(2), 'L:', dump.bs.L.toFixed(2), 'E:', dump.bs.E.toFixed(2))
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
