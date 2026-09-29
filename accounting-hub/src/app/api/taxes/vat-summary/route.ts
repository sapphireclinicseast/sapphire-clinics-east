import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const PAYROLL_TO_PC: Record<string, string> = { SBEA: 'SANDBOX_EAST', SBGH: 'SANDBOX_GREENHILLS', VERDANA: 'VERDANA_STORE', AHI: 'AURA_INSTITUTE' }
const VAT_RATE = 0.12

// GET ?payrollBranch=SBEA&from=YYYY-MM-DD&to=YYYY-MM-DD
// Output VAT (from POS/orders) vs creditable Input VAT (from VAT expenses).
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  // payrollBranch optional: omitted (or 'ALL') = whole corporation (VAT is filed as one entity).
  const pbRaw = sp.get('payrollBranch') || ''
  const allBranches = pbRaw === '' || pbRaw.toUpperCase() === 'ALL'
  const pcBranch = allBranches ? null : PAYROLL_TO_PC[pbRaw]
  if (!allBranches && !pcBranch) return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  const branchWhere = pcBranch ? { branch: pcBranch } : {}
  const from = sp.get('from'), to = sp.get('to')
  const range: { gte?: Date; lt?: Date } = {}
  if (from) range.gte = new Date(from)
  if (to) { const d = new Date(to); d.setUTCDate(d.getUTCDate() + 1); range.lt = d }

  // Output VAT: PRODUCT sales only (medical Services are VAT-exempt). Net of
  // platform discounts (Order.netAmount), VAT-inclusive.
  const orders = await prisma.order.findMany({
    where: { ...branchWhere, orderType: 'PRODUCT', status: 'COMPLETED', returnedByBuyer: false, ...(from || to ? { transactionDate: range } : {}) },
    select: { netAmount: true },
  })
  const outputGross = orders.reduce((s, o) => s + Number(o.netAmount), 0)
  const outputVat = outputGross * (VAT_RATE / (1 + VAT_RATE))

  // SI-based (invoiced) sales — the correct 2550Q sales source: only sales that
  // carry an official Sales Invoice. PRODUCT = vatable; Services / SI'd AR
  // collections = VAT-exempt. Used to pre-fill the (editable) 2550Q sales lines.
  const siOrders = await prisma.order.findMany({
    where: { ...branchWhere, status: { in: ['COMPLETED', 'REOPENED'] }, issuedOfficialInvoice: true, salesInvoiceNumber: { not: null }, ...(from || to ? { transactionDate: range } : {}) },
    select: { netAmount: true, orderType: true },
  })
  const siVatableSales = siOrders.filter(o => o.orderType === 'PRODUCT').reduce((s, o) => s + Number(o.netAmount), 0)
  let siExemptSales = siOrders.filter(o => o.orderType !== 'PRODUCT').reduce((s, o) => s + Number(o.netAmount), 0)
  const siArPayments = await prisma.aRPayment.findMany({
    where: { ...branchWhere, salesInvoiceNumber: { not: null }, ...(from || to ? { paymentDate: range } : {}) },
    select: { amount: true, discount: true },
  })
  siExemptSales += siArPayments.reduce((s, p) => s + Number(p.amount) + Number(p.discount), 0)

  // Input VAT: paid VATable expenses in the period (VAT-inclusive gross).
  const exps = await prisma.pettyCashEntry.findMany({
    where: { ...branchWhere, recordType: { in: ['ONE_TIME', 'RECURRING'] }, vatable: 'VAT', paidAt: { not: null }, ...(from || to ? { date: range } : {}) },
    select: { grossAmount: true },
  })
  const inputGross = exps.reduce((s, e) => s + Number(e.grossAmount), 0)
  const inputVat = inputGross * (VAT_RATE / (1 + VAT_RATE))

  return NextResponse.json({
    outputGross, outputVat, orderCount: orders.length,
    siVatableSales, siExemptSales, // SI-based sales for the 2550Q (editable defaults)
    inputGross, inputVat, expenseCount: exps.length,
    computedPayable: outputVat - inputVat,
  })
}
