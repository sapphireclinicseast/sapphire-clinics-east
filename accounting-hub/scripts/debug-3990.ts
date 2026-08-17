// Read-only diagnostic driver — calls the real, unmodified computeLedgerStatements
// exactly as the app does, to see the bank-trueup breakdown for SCEI Main
// Corporate Account (004688017267) through August 2025.
import { computeLedgerStatements } from '../src/lib/reports/v2/engine'
import { prisma } from '../src/lib/prisma'

async function main() {
  const acct = await prisma.account.findFirst({ where: { accountNumber: '004688017267' } })
  console.log('=== Account ===')
  console.log(JSON.stringify(acct, null, 2))

  const stmt = await computeLedgerStatements(2025, 'ALL', { account: '3990', month: 8, cumulative: true })

  console.log('\n=== 3990 collected lines (cumulative through Aug 2025) ===')
  for (const l of stmt.collected || []) {
    console.log(`m${l.month}\t${l.source}\tdr=${l.debit}\tcr=${l.credit}\t${l.label}`)
  }
  console.log('\n=== 3990 totals ===', stmt.collectedTotals)

  console.log('\n=== validation.cashRecon rows (SCEI Main only) ===')
  const rows = stmt.validation.cashRecon?.rows.filter(r => r.number === '004688017267') || []
  console.log(JSON.stringify(rows, null, 2))

  console.log('\n=== validation notes/synthesized ===')
  console.log(JSON.stringify({ synthesized: stmt.validation.synthesized, notes: stmt.validation.notes }, null, 2))

  await prisma.$disconnect()
}
main().catch(e => { console.error(e); process.exit(1) })
