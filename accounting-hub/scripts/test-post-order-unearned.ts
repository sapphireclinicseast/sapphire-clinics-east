// LOCAL-ONLY: verifies postOrderJournal's unearned-discount deferral on the
// seeded package order (run seed-v2-test.mjs first). Posts the JE with the
// flag forced on, prints its lines, and cleans up afterwards.
process.env.ENABLE_GL_POSTING = 'true'
import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { postOrderJournal } from '../src/lib/accounting/post-order'

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
  const order = await prisma.order.findFirst({
    where: { referenceNumber: 'V2TEST', revenueType: 'UNEARNED' },
    select: { id: true, netAmount: true, discountAmount: true },
  })
  if (!admin || !order) throw new Error('seed data missing')

  // ensure the 7000 fallback exists for the package line (no service linked)
  if (!(await prisma.account.findUnique({ where: { accountNumber: '7000' } }))) {
    await prisma.account.create({
      data: { accountNumber: '7000', accountTitle: 'Gross Revenue', accountType: 'REVENUE', subType: 'OPERATING_REVENUE', normalBalance: 'CREDIT', createdById: admin.id },
    })
  }
  // clean any previous run
  await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceType: 'POS_ORDER', referenceId: order.id } } })
  await prisma.journalEntry.deleteMany({ where: { referenceType: 'POS_ORDER', referenceId: order.id } })

  const result = await postOrderJournal(prisma as never, order.id, admin.id)
  console.log('postOrderJournal:', JSON.stringify(result))
  if (result.journalEntryId) {
    const lines = await prisma.journalEntryLine.findMany({
      where: { journalEntryId: result.journalEntryId },
      select: { debit: true, credit: true, account: { select: { accountNumber: true, accountTitle: true } } },
    })
    for (const l of lines) {
      console.log(`  ${l.account?.accountNumber} ${l.account?.accountTitle}: DR ${l.debit} CR ${l.credit}`)
    }
  }
}

main().finally(() => prisma.$disconnect())
