import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const TAKE = 6
const num = (v: unknown) => Number(v) || 0
const dstr = (d: Date | null | undefined) => (d ? new Date(d).toISOString().slice(0, 10) : '')

// Unified search hit
interface Hit {
  id: string; type: string; title: string; subtitle: string
  amount: number | null; reference: string; date: string; href: string
  detail: Record<string, string>
}

// GET /api/search?q=...  — QuickBooks-style global search across the hub.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const q = (new URL(req.url).searchParams.get('q') || '').trim()
  if (q.length < 2) return NextResponse.json({ results: [] })

  const clean = q.replace(/[,₱\s]/g, '')
  const isNum = clean !== '' && !isNaN(Number(clean))
  const n = Number(clean)
  const ci = { contains: q, mode: 'insensitive' as const }

  // Branch scoping: admin/accountant/viewer see all; branch admins & front desk see only their branch.
  // Branch is stored inconsistently across models, so match every known code per branch.
  const BRANCH_SETS: Record<string, string[]> = {
    SANDBOX_EAST: ['SANDBOX_EAST', 'SBEA', 'AHEA'],
    SANDBOX_GREENHILLS: ['SANDBOX_GREENHILLS', 'SBGH', 'AHGH'],
    VERDANA_STORE: ['VERDANA_STORE', 'VER', 'VERDANA'],
  }
  const ROLE_BRANCH: Record<string, string> = {
    SBEA_ADMIN: 'SANDBOX_EAST', SBGH_ADMIN: 'SANDBOX_GREENHILLS', VERDANA_ADMIN: 'VERDANA_STORE',
    SBEA_FRONTDESK: 'SANDBOX_EAST', SBGH_FRONTDESK: 'SANDBOX_GREENHILLS',
  }
  const scopeBranch = ROLE_BRANCH[(session.user.role as string) || '']
  const scope = scopeBranch ? BRANCH_SETS[scopeBranch] : null
  const oBranch: Record<string, unknown> = scope ? { branch: { in: scope } } : {}
  const jBranch: Record<string, unknown> = scope ? { branch: { in: [...scope, 'ALL'] } } : {}

  const [orders, pcEntries, reimbs, ccReports, expSuppliers, suppliers, inv, accounts, journals, assets] = await Promise.all([
    prisma.order.findMany({
      where: { ...oBranch, OR: [
        ...(isNum ? [{ orderNumber: Math.round(n) }, { netAmount: n }] : []),
        { patientName: ci }, { clinicianName: ci }, { salesInvoiceNumber: ci }, { referenceNumber: ci },
      ] },
      take: TAKE, orderBy: { transactionDate: 'desc' },
      select: { id: true, orderNumber: true, patientName: true, netAmount: true, salesInvoiceNumber: true, referenceNumber: true, branch: true, transactionDate: true, platform: true },
    }),
    prisma.pettyCashEntry.findMany({
      where: { ...oBranch, OR: [
        ...(isNum ? [{ grossAmount: n }] : []),
        { pcvNumber: ci }, { requestor: ci }, { registeredName: ci }, { description: ci }, { accountTitle: ci }, { siNumber: ci }, { tinNumber: ci },
      ] },
      take: TAKE, orderBy: { date: 'desc' },
      select: { id: true, pcvNumber: true, requestor: true, registeredName: true, description: true, accountTitle: true, grossAmount: true, branch: true, date: true, recordType: true },
    }),
    prisma.reimbursementReport.findMany({
      where: { ...oBranch, OR: [...(isNum ? [{ grossTotal: n }] : []), { refNumber: ci }] },
      take: TAKE, orderBy: { createdAt: 'desc' },
      select: { id: true, refNumber: true, grossTotal: true, branch: true, status: true, createdAt: true },
    }),
    prisma.creditCardReport.findMany({
      where: { ...oBranch, refNumber: ci }, take: TAKE, orderBy: { createdAt: 'desc' },
      select: { id: true, refNumber: true, bankCode: true, branch: true, periodMonth: true, periodYear: true, status: true },
    }),
    prisma.expenseSupplier.findMany({
      where: { ...oBranch, OR: [{ registeredName: ci }, { tin: ci }, { registeredAddress: ci }] },
      take: TAKE, orderBy: { registeredName: 'asc' },
      select: { id: true, registeredName: true, registeredAddress: true, tin: true, branch: true },
    }),
    prisma.supplier.findMany({
      where: { OR: [{ supplierName: ci }, { email: ci }, { contactNumber: ci }, { address: ci }] },
      take: TAKE, orderBy: { supplierName: 'asc' },
      select: { id: true, supplierName: true, email: true, contactNumber: true, address: true },
    }),
    prisma.inventoryItem.findMany({
      where: { OR: [{ name: ci }, { sku: ci }, { barcode: ci }] },
      take: TAKE, orderBy: { name: 'asc' },
      select: { id: true, name: true, sku: true, quantity: true, sellingPrice: true, unitCost: true },
    }),
    prisma.account.findMany({
      where: { OR: [{ accountNumber: ci }, { accountTitle: ci }] },
      take: TAKE, orderBy: { accountNumber: 'asc' },
      select: { id: true, accountNumber: true, accountTitle: true, subType: true },
    }),
    prisma.journalEntry.findMany({
      where: { ...jBranch, OR: [...(isNum ? [{ totalAmount: n }] : []), { description: ci }, { referenceType: ci }, { referenceId: ci }] },
      take: TAKE, orderBy: { entryDate: 'desc' },
      select: { id: true, description: true, referenceType: true, totalAmount: true, branch: true, entryDate: true },
    }),
    prisma.asset.findMany({
      where: { OR: [...(isNum ? [{ totalAmount: n }, { purchasePrice: n }] : []), { name: ci }, { controlNumber: ci }, { remarks: ci }] },
      take: TAKE, orderBy: { dateBought: 'desc' },
      select: { id: true, name: true, controlNumber: true, totalAmount: true, classification: true, dateBought: true },
    }),
  ])

  const results: Hit[] = []

  for (const o of orders) results.push({
    id: o.id, type: 'Sale / Order', title: `Order #${o.orderNumber}${o.patientName ? ` · ${o.patientName}` : ''}`,
    subtitle: `${o.branch}${o.platform ? ` · ${o.platform}` : ''} · ${dstr(o.transactionDate)}`,
    amount: num(o.netAmount), reference: o.salesInvoiceNumber || o.referenceNumber || '', date: dstr(o.transactionDate), href: '/sales-summary',
    detail: { 'Order #': String(o.orderNumber), Customer: o.patientName || '—', Branch: o.branch, Platform: o.platform || '—', 'SI #': o.salesInvoiceNumber || '—', Reference: o.referenceNumber || '—', 'Net Amount': num(o.netAmount).toFixed(2), Date: dstr(o.transactionDate) },
  })
  for (const e of pcEntries) {
    const isPc = e.recordType === 'PETTY_CASH'
    results.push({
      id: e.id, type: isPc ? 'Petty Cash' : (e.recordType === 'RECURRING' ? 'Expense (Recurring)' : 'Expense (One-time)'),
      title: `${e.pcvNumber} · ${e.registeredName || e.requestor || e.description || 'Entry'}`,
      subtitle: `${e.branch} · ${e.accountTitle || ''} · ${dstr(e.date)}`,
      amount: num(e.grossAmount), reference: e.pcvNumber, date: dstr(e.date), href: isPc ? '/petty-cash' : '/expenses',
      detail: { 'PCV #': e.pcvNumber, Payee: e.requestor || '—', 'Registered Name': e.registeredName || '—', 'Account Title': e.accountTitle || '—', Description: e.description || '—', Branch: e.branch, 'Gross Amount': num(e.grossAmount).toFixed(2), Date: dstr(e.date) },
    })
  }
  for (const r of reimbs) results.push({
    id: r.id, type: 'Reimbursement', title: r.refNumber, subtitle: `${r.branch} · ${r.status} · ${dstr(r.createdAt)}`,
    amount: num(r.grossTotal), reference: r.refNumber, date: dstr(r.createdAt), href: '/petty-cash',
    detail: { Reference: r.refNumber, Branch: r.branch, Status: r.status, 'Gross Total': num(r.grossTotal).toFixed(2), Created: dstr(r.createdAt) },
  })
  for (const c of ccReports) results.push({
    id: c.id, type: 'Credit Card Report', title: c.refNumber, subtitle: `${c.branch} · ${c.periodMonth}/${c.periodYear} · ${c.status}`,
    amount: null, reference: c.refNumber, date: '', href: '/expenses',
    detail: { Reference: c.refNumber, 'Bank Code': c.bankCode, Branch: c.branch, Period: `${c.periodMonth}/${c.periodYear}`, Status: c.status },
  })
  for (const s of expSuppliers) results.push({
    id: s.id || s.registeredName, type: 'Supplier (Expense)', title: s.registeredName, subtitle: `${s.branch}${s.tin ? ` · TIN ${s.tin}` : ''}`,
    amount: null, reference: s.tin || '', date: '', href: '/expenses',
    detail: { 'Registered Name': s.registeredName, 'Registered Address': s.registeredAddress || '—', TIN: s.tin || '—', Branch: s.branch },
  })
  for (const s of suppliers) results.push({
    id: s.id, type: 'Supplier (Procurement)', title: s.supplierName, subtitle: s.contactNumber || s.email || '',
    amount: null, reference: '', date: '', href: '/inventory',
    detail: { Name: s.supplierName, Email: s.email || '—', Contact: s.contactNumber || '—', Address: s.address || '—' },
  })
  for (const i of inv) results.push({
    id: i.id, type: 'Inventory', title: `${i.name} · ${i.sku}`, subtitle: `Qty ${i.quantity}${i.sellingPrice != null ? ` · ₱${num(i.sellingPrice).toFixed(2)}` : ''}`,
    amount: i.sellingPrice != null ? num(i.sellingPrice) : null, reference: i.sku, date: '', href: '/inventory',
    detail: { Name: i.name, SKU: i.sku, Quantity: String(i.quantity), 'Unit Cost': num(i.unitCost).toFixed(2), 'Selling Price': i.sellingPrice != null ? num(i.sellingPrice).toFixed(2) : '—' },
  })
  for (const a of accounts) results.push({
    id: a.id, type: 'Account', title: `${a.accountNumber} ${a.accountTitle}`, subtitle: a.subType || '',
    amount: null, reference: a.accountNumber, date: '', href: '/chart-of-accounts',
    detail: { 'Account #': a.accountNumber, Title: a.accountTitle, Type: a.subType || '—' },
  })
  for (const j of journals) results.push({
    id: j.id, type: 'Journal Entry', title: j.description, subtitle: `${j.referenceType} · ${j.branch} · ${dstr(j.entryDate)}`,
    amount: num(j.totalAmount), reference: j.referenceType, date: dstr(j.entryDate), href: '/reports/v2',
    detail: { Description: j.description, 'Reference Type': j.referenceType, Branch: j.branch, 'Total Amount': num(j.totalAmount).toFixed(2), Date: dstr(j.entryDate) },
  })
  for (const a of assets) results.push({
    id: a.id, type: 'Asset', title: `${a.name}${a.controlNumber ? ` · ${a.controlNumber}` : ''}`, subtitle: `Class ${a.classification} · ${dstr(a.dateBought)}`,
    amount: num(a.totalAmount), reference: a.controlNumber || '', date: dstr(a.dateBought), href: '/asset-management',
    detail: { Name: a.name, 'Control #': a.controlNumber || '—', Classification: a.classification, 'Total Amount': num(a.totalAmount).toFixed(2), 'Date Bought': dstr(a.dateBought) },
  })

  return NextResponse.json({ results })
}
