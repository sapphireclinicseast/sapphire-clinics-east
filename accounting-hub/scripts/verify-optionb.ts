import { computeLedgerStatements } from '../src/lib/reports/v2/engine'
const f = (n: number) => n.toLocaleString('en-PH', { minimumFractionDigits: 2 })
async function main() {
  for (const b of ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']) {
    const r: any = await computeLedgerStatements(2026, b)
    const rows: any[] = r.balanceSheet.sections.flatMap((s: any) => s.rows)
    const g = (n: string) => rows.find(x => x.number === n)
    const cashJul = rows.filter(x => x.cash).reduce((s, x) => s + (x.monthly?.[6] ?? 0), 0)
    console.log(`${b}: A=L+E ${r.validation.aEqualsLE} (diff ${f(r.validation.aLEDiff)})  cash Jul ${f(cashJul)}`)
    console.log(`   3990: ${g('3990') ? f(g('3990').monthly[6]) : 'not on sheet'}   3985 Jul: ${g('3985') ? f(g('3985').monthly[6]) : 'not on sheet'}   3980 Jul: ${g('3980') ? f(g('3980').monthly[6]) : 'not on sheet'}   11300: ${g('11300') ? f(g('11300').closing) : '—'}`)
  }
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
