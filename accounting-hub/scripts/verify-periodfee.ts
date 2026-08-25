import { computeLedgerStatements } from '../src/lib/reports/v2/engine'
const f = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
async function main() {
  const r: any = await computeLedgerStatements(2026, 'ALL')
  const bsRows: any[] = r.balanceSheet.sections.flatMap((s: any) => s.rows)
  const isRows: any[] = r.incomeStatement.sections.flatMap((s: any) => s.rows)
  const g = (rows: any[], n: string) => rows.find((x: any) => x.number === n)
  const u = g(bsRows, '4050'); const sped = g(isRows, '7040')
  console.log('4050 Unearned monthly balance:', (u?.monthly ?? []).map((v: number, i: number) => `m${i + 1}:${f(v)}`).slice(4, 9).join('  '))
  console.log('7040 SPED revenue monthly:', (sped?.monthly ?? []).map((v: number, i: number) => `m${i + 1}:${f(v)}`).slice(4, 9).join('  '))
  console.log('A=L+E:', r.validation.aEqualsLE, ' netIncome:', f(r.incomeStatement.netIncome))
  for (const b of ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']) {
    const rb: any = await computeLedgerStatements(2026, b)
    console.log(`${b}: A=L+E ${rb.validation.aEqualsLE} (diff ${f(rb.validation.aLEDiff)})`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
