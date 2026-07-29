// LOCAL-ONLY test seed for the Reports v2 engine. Never run in production.
// Seeds a tiny known dataset for FY2026 whose statements are hand-computable:
//   opening: cash 100,000 / inventory 10,000 / capital 110,000 (balanced)
//   manual JE: marketing 5,000 paid from bank
//   petty cash: 1,120 gross VAT → 1,000 supplies-direct + 120 Input VAT
//   order: net 10,000 (line 10,500, PWD discount 500) paid in cash
//   asset: 24,000 bought Jan-2026, 1,000/month depreciation
// Expected: NI −6,400 · Assets 103,600 (incl. DTA 1,600) = L 0 + E 103,600 · CF ties.
import pkg from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
const { PrismaClient } = pkg
const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) })

const YEAR = 2026
const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } })
if (!admin) throw new Error('no admin user')

// idempotent: wipe any previous test rows first
await prisma.journalEntryLine.deleteMany({ where: { journalEntry: { referenceId: 'v2-test-je-1' } } })
await prisma.journalEntry.deleteMany({ where: { referenceId: 'v2-test-je-1' } })
await prisma.pettyCashEntry.deleteMany({ where: { pcvNumber: 'V2TEST-01' } })
const oldOrders = await prisma.order.findMany({ where: { referenceNumber: 'V2TEST' }, select: { id: true } })
for (const o of oldOrders) {
  await prisma.orderPayment.deleteMany({ where: { orderId: o.id } })
  await prisma.orderItem.deleteMany({ where: { orderId: o.id } })
  await prisma.order.delete({ where: { id: o.id } })
}
await prisma.asset.deleteMany({ where: { name: 'V2 Test Equipment' } })

async function acct(accountNumber, accountTitle, accountType, subType, normalBalance, extra = {}) {
  const existing = await prisma.account.findUnique({ where: { accountNumber } })
  if (existing) return existing
  return prisma.account.create({
    data: { accountNumber, accountTitle, accountType, subType, normalBalance, createdById: admin.id, ...extra },
  })
}

const cash = await acct('1001', 'Cash in Bank - Test', 'ASSET', 'CURRENT_ASSETS', 'DEBIT', { isBankAccount: true })
await acct('1010', 'Accounts Receivable', 'ASSET', 'CURRENT_ASSETS', 'DEBIT')
await acct('1040', 'Input VAT', 'ASSET', 'CURRENT_ASSETS', 'DEBIT')
const inv = await acct('1200', 'Inventory Asset', 'ASSET', 'INVENTORY', 'DEBIT')
await acct('1500', 'PPE and Leasehold Improvements', 'ASSET', 'PPE', 'DEBIT')
await acct('2010', 'Accumulated Depreciation', 'ASSET', 'PPE', 'CREDIT')
await acct('4010', 'Accounts Payable', 'LIABILITY', 'CURRENT_LIABILITIES', 'CREDIT')
await acct('4050', 'Unearned Revenue', 'LIABILITY', 'CURRENT_LIABILITIES', 'CREDIT')
const capital = await acct('5010', 'Subscribed and Paid Up Capital', 'EQUITY', 'OWNERS_EQUITY', 'CREDIT')
const rev = await acct('7020', 'Occupational Therapy Services Revenue', 'REVENUE', 'OPERATING_REVENUE', 'CREDIT')
await acct('7130', 'PWD or Senior Citizen Discount', 'REVENUE', 'OPERATING_REVENUE', 'DEBIT')
const supplies = await acct('8020', 'Clinic Supplies Expense–Direct', 'EXPENSE', 'DIRECT_EXPENSES', 'DEBIT')
const mkt = await acct('8120', 'Marketing and Advertising Expense', 'EXPENSE', 'INDIRECT_EXPENSES', 'DEBIT')
await acct('8070', 'Depreciation Expense', 'EXPENSE', 'NON_OPERATING_EXPENSES', 'DEBIT')

// opening balances (balanced)
for (const [a, amount] of [[cash, 100000], [inv, 10000], [capital, 110000]]) {
  await prisma.beginningBalance.upsert({
    where: { accountId_periodYear: { accountId: a.id, periodYear: YEAR } },
    create: { accountId: a.id, periodYear: YEAR, amount, createdById: admin.id },
    update: { amount },
  })
}

// manual JE: DR marketing 5,000 / CR bank
await prisma.journalEntry.create({
  data: {
    entryDate: new Date(Date.UTC(YEAR, 3, 15)), description: 'v2 test: marketing paid by bank',
    referenceType: 'MANUAL', referenceId: 'v2-test-je-1', totalAmount: 5000, branch: 'SANDBOX_EAST', createdById: admin.id,
    lines: { create: [
      { accountId: mkt.id, debit: 5000, credit: 0 },
      { accountId: cash.id, debit: 0, credit: 5000 },
    ] },
  },
})

// petty cash: gross 1,120 VAT
await prisma.pettyCashEntry.create({
  data: {
    branch: 'SANDBOX_EAST', pcvNumber: 'V2TEST-01', pcvSeq: 999901, pcvSub: 0,
    date: new Date(Date.UTC(YEAR, 5, 10)), grossAmount: 1120, vatable: 'VAT',
    accountTitle: `${supplies.accountNumber} ${supplies.accountTitle}`, recordType: 'ONE_TIME',
  },
})

// payment mode CASH → bank account
const mode = await prisma.paymentMode.findFirst({ where: { name: 'V2 Test Cash' } })
  || await prisma.paymentMode.create({ data: { name: 'V2 Test Cash', paymentMethod: 'CASH', accountId: cash.id } })

// service mapped to 7020
const svc = await prisma.service.findFirst({ where: { name: 'V2 Test OT Session' } })
  || await prisma.service.create({
    data: {
      name: 'V2 Test OT Session', department: 'OT', branch: 'SANDBOX_EAST', price: 10500,
      revenueAccountId: rev.id, createdById: admin.id,
    },
  })

// order: line 10,500, PWD 500, net 10,000, paid cash
await prisma.order.create({
  data: {
    orderType: 'SERVICE', branch: 'SANDBOX_EAST', status: 'COMPLETED', paymentStatus: 'PAID',
    subtotal: 10500, discountAmount: 500, discountType: 'PWD_SC', discountLabel: 'PWD Discount',
    netAmount: 10000, revenueType: 'EARNED', referenceNumber: 'V2TEST',
    transactionDate: new Date(Date.UTC(YEAR, 4, 10)), createdById: admin.id,
    items: { create: [{ serviceId: svc.id, name: svc.name, quantity: 1, unitPrice: 10500, lineTotal: 10500 }] },
    payments: { create: [{ method: 'CASH', amount: 10000, paymentModeId: mode.id }] },
  },
})

// package purchase (UNEARNED, mirrors prod order #1328): 25,500 package,
// PWD 5,100, net 20,400 collected → should credit Unearned only, NO discount
// on the IS at purchase time.
await prisma.order.create({
  data: {
    orderType: 'SERVICE', branch: 'SANDBOX_EAST', status: 'COMPLETED', paymentStatus: 'PAID',
    subtotal: 25500, discountAmount: 5100, discountType: 'PWD_SC', discountLabel: 'PWD/Senior Citizen (20%)',
    netAmount: 20400, revenueType: 'UNEARNED', referenceNumber: 'V2TEST',
    transactionDate: new Date(Date.UTC(YEAR, 4, 12)), createdById: admin.id,
    items: { create: [{ name: '12 BASIC SESSION PACKAGE', quantity: 1, unitPrice: 25500, lineTotal: 25500 }] },
    payments: { create: [{ method: 'CASH', amount: 20400, paymentModeId: mode.id }] },
  },
})

// asset: 24,000 bought Jan-2026, 1,000/month
await prisma.asset.create({
  data: {
    branch: 'SANDBOX_EAST', name: 'V2 Test Equipment', purchasePrice: 24000, quantity: 1,
    totalAmount: 24000, dateBought: new Date(Date.UTC(YEAR, 0, 15)), classification: '1500',
    yearsDepreciation: 2, monthlyDepreciation: 1000,
    depreciationEndDate: new Date(Date.UTC(YEAR + 2, 0, 15)), departments: [], createdById: admin.id,
  },
})

console.log('seeded v2 test data')
await prisma.$disconnect()
