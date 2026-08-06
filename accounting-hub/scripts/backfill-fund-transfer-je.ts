/**
 * One-off: post the missing journal entry for every existing fund transfer.
 *
 * Fund transfers were recorded without a journal entry, so the ledger never
 * moved the money between accounts. Run once; it is idempotent (the helper
 * skips a transfer that already has an entry) and safe to re-run.
 *
 * Skipped on purpose:
 *  - cross-currency exchanges (need an FX gain/loss policy)
 *  - transfers whose cash movement is ALREADY in the ledger because someone
 *    categorised a bank line straight to the other bank account — detected as
 *    an existing entry that debits the destination account for the same amount
 *    within 3 days. Posting those again would double-count.
 *
 *   npx tsx scripts/backfill-fund-transfer-je.ts [--apply]
 */
import { PrismaClient } from '@prisma/client'
import { postFundTransferJE, isCrossCurrency } from '../src/lib/fund-transfer-je'

const prisma = new PrismaClient()
const APPLY = process.argv.includes('--apply')

async function main() {
  const transfers = await prisma.fundTransfer.findMany({
    orderBy: { date: 'asc' },
    select: { id: true, refNumber: true, date: true, amount: true, toAmount: true, fromAccountId: true, toAccountId: true },
  })
  const already = new Set(
    (await prisma.journalEntry.findMany({ where: { referenceType: 'FUND_TRANSFER' }, select: { referenceId: true } }))
      .map(j => j.referenceId).filter(Boolean) as string[],
  )

  let posted = 0, skipForex = 0, skipDup = 0, skipHave = 0
  const collisions: string[] = []
  for (const ft of transfers) {
    if (already.has(ft.id)) { skipHave++; continue }
    if (isCrossCurrency(ft)) { skipForex++; continue }
    // already in the ledger via a categorised bank line?
    const lo = new Date(ft.date); lo.setUTCDate(lo.getUTCDate() - 3)
    const hi = new Date(ft.date); hi.setUTCDate(hi.getUTCDate() + 4)
    const dup = await prisma.journalEntryLine.findFirst({
      where: {
        accountId: ft.toAccountId, debit: ft.amount,
        journalEntry: { entryDate: { gte: lo, lt: hi }, referenceType: { not: 'FUND_TRANSFER' } },
      },
      select: { id: true, journalEntry: { select: { description: true } } },
    })
    if (dup) {
      skipDup++
      collisions.push(`${ft.refNumber} ${ft.date.toISOString().slice(0, 10)} ${Number(ft.amount).toLocaleString()} — already: ${dup.journalEntry.description.slice(0, 60)}`)
      continue
    }
    if (APPLY) await prisma.$transaction(async tx => { await postFundTransferJE(tx, ft.id, null) })
    posted++
  }
  console.log(`${APPLY ? 'POSTED' : 'WOULD POST'}: ${posted}`)
  console.log(`skipped — already had an entry: ${skipHave}, cross-currency: ${skipForex}, already in ledger via categorised line: ${skipDup}`)
  if (collisions.length) { console.log('\ncollisions (left alone):'); collisions.slice(0, 40).forEach(c => console.log('  ' + c)) }
}
main().catch(e => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
