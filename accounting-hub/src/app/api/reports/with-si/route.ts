import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'AURA_INSTITUTE']
const siInt = (s: string | null) => { const d = String(s || '').replace(/\D/g, ''); return d ? parseInt(d, 10) : null }
const pad4 = (n: number) => String(n).padStart(4, '0')

// GET ?branch=&dateFrom=&dateTo= — SI orders for a branch with VAT/Non-VAT class,
// plus gaps (missing numbers) and duplicates in the continuous SI sequence.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  // Branch-scoped users (e.g. front desk) are forced to their own branch.
  const branch = enforceBranch((session.user as { branch?: string }).branch) ?? (sp.get('branch') || '')
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Select a branch' }, { status: 400 })
  const dateFrom = sp.get('dateFrom') || ''
  const dateTo = sp.get('dateTo') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { branch, status: { in: ['COMPLETED', 'REOPENED'] }, issuedOfficialInvoice: true, salesInvoiceNumber: { not: null } }
  if (dateFrom) where.transactionDate = { ...where.transactionDate, gte: new Date(`${dateFrom}T00:00:00+08:00`) }
  if (dateTo) where.transactionDate = { ...where.transactionDate, lte: new Date(`${dateTo}T23:59:59.999+08:00`) }

  try {
    const orders = await prisma.order.findMany({
      where, orderBy: { transactionDate: 'asc' },
      select: { id: true, orderNumber: true, orderType: true, transactionDate: true, patientName: true, netAmount: true, salesInvoiceNumber: true },
    })
    const orderRows = orders.map(o => {
      const n = siInt(o.salesInvoiceNumber)
      const amt = Number(o.netAmount)
      const isProduct = o.orderType === 'PRODUCT'
      return {
        id: o.id, orderNumber: o.orderNumber, siNumber: o.salesInvoiceNumber || '', siInt: n,
        date: new Date(o.transactionDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }),
        patientName: o.patientName || '—',
        vat: isProduct ? amt : 0, nonVat: isProduct ? 0 : amt, amount: amt,
        orderType: o.orderType,
      }
    })

    // HMO/GL collections that were issued a Sales Invoice on payment (Accounts
    // Receivable → Record Payment). Same SI series, so they join the sequence for
    // VAT/Non-VAT totals and gap/duplicate detection. Services → Non-VAT.
    const arPayments = await prisma.aRPayment.findMany({
      where: {
        branch, salesInvoiceNumber: { not: null },
        ...(dateFrom || dateTo ? { paymentDate: { ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00+08:00`) } : {}), ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999+08:00`) } : {}) } } : {}),
      },
      orderBy: { paymentDate: 'asc' },
      select: { id: true, salesInvoiceNumber: true, paymentDate: true, amount: true, discount: true, wallet: { select: { patientName: true, walletType: true } } },
    })
    const arRows = arPayments.map(p => {
      const amt = Number(p.amount) + Number(p.discount)
      return {
        id: p.id, orderNumber: `AR-${p.wallet?.walletType || ''}`, siNumber: p.salesInvoiceNumber || '', siInt: siInt(p.salesInvoiceNumber),
        date: new Date(p.paymentDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }),
        patientName: `${p.wallet?.patientName || '—'} (${p.wallet?.walletType || 'AR'})`,
        vat: 0, nonVat: amt, amount: amt,
        orderType: `AR_${p.wallet?.walletType || ''}`,
      }
    })

    const rows = [...orderRows, ...arRows]
      .filter(r => r.siInt !== null)
      .sort((a, b) => (a.siInt! - b.siInt!))

    // Duplicates: same SI number on >1 order.
    const countByInt = new Map<number, number>()
    for (const r of rows) countByInt.set(r.siInt!, (countByInt.get(r.siInt!) || 0) + 1)
    const duplicates = [...countByInt.entries()].filter(([, c]) => c > 1).map(([n, c]) => ({ siNumber: pad4(n), count: c }))

    // Gaps: missing integers between min and max of the sequence.
    const gaps: { siNumber: string }[] = []
    if (rows.length > 1) {
      const present = new Set(rows.map(r => r.siInt!))
      const min = rows[0].siInt!, max = rows[rows.length - 1].siInt!
      for (let i = min + 1; i < max; i++) if (!present.has(i)) gaps.push({ siNumber: pad4(i) })
    }

    // All flag resolutions for the branch (Cancelled / Remarks / Tagged-to-order).
    const allFlags = await prisma.salesInvoiceFlag.findMany({ where: { branch } })
    const flagBy = new Map(allFlags.map(f => [f.siNumber, { status: f.status, remarks: f.remarks, orderId: f.orderId }]))

    return NextResponse.json({
      rows,
      totals: { vat: rows.reduce((s, r) => s + r.vat, 0), nonVat: rows.reduce((s, r) => s + r.nonVat, 0), count: rows.length },
      gaps: gaps.map(g => ({ ...g, flag: flagBy.get(g.siNumber) || null })),
      duplicates: duplicates.map(d => ({ ...d, flag: flagBy.get(d.siNumber) || null })),
      flags: allFlags.map(f => ({ siNumber: f.siNumber, status: f.status, remarks: f.remarks, orderId: f.orderId })),
    })
  } catch (err) {
    console.error('With-SI error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// POST { branch, siNumber, status: 'CANCELLED'|'REMARKS', remarks } — save a flag resolution.
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { siNumber, status, remarks, orderId } = body
    // Branch-scoped users can only flag invoices in their own branch.
    const branch = enforceBranch((session.user as { branch?: string }).branch) ?? body.branch
    if (!VALID_BRANCHES.includes(branch) || !siNumber || !['CANCELLED', 'REMARKS', 'TAGGED'].includes(status)) {
      return NextResponse.json({ error: 'branch, siNumber and a valid status are required' }, { status: 400 })
    }
    // Tag-to-order: the missing SI number is actually an order that was never
    // labelled — assign this SI to that order so it joins the sequence.
    if (status === 'TAGGED') {
      if (!orderId) return NextResponse.json({ error: 'Select an order to tag' }, { status: 400 })
      const order = await prisma.order.findFirst({ where: { id: orderId, branch } })
      if (!order) return NextResponse.json({ error: 'Order not found in this branch' }, { status: 404 })
      if (order.salesInvoiceNumber) return NextResponse.json({ error: 'That order already has a Sales Invoice number' }, { status: 400 })
      await prisma.order.update({ where: { id: orderId }, data: { salesInvoiceNumber: String(siNumber), issuedOfficialInvoice: true } })
      await prisma.salesInvoiceFlag.upsert({
        where: { branch_siNumber: { branch, siNumber: String(siNumber) } },
        update: { status, orderId, remarks: null },
        create: { branch, siNumber: String(siNumber), status, orderId, createdById: session.user.id as string },
      })
      return NextResponse.json({ success: true })
    }
    await prisma.salesInvoiceFlag.upsert({
      where: { branch_siNumber: { branch, siNumber: String(siNumber) } },
      update: { status, remarks: remarks?.trim() || null, orderId: null },
      create: { branch, siNumber: String(siNumber), status, remarks: remarks?.trim() || null, createdById: session.user.id as string },
    })
    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('SI flag save error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE ?branch=&siNumber= — clear a resolution (re-flag the number).
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes((session.user as { role?: string }).role || '')) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams
  const branch = enforceBranch((session.user as { branch?: string }).branch) ?? (sp.get('branch') || '')
  const siNumber = sp.get('siNumber') || ''
  if (!branch || !siNumber) return NextResponse.json({ error: 'branch and siNumber required' }, { status: 400 })
  // If this was a tag-to-order, un-label the order so the SI reverts to a gap.
  const existing = await prisma.salesInvoiceFlag.findUnique({ where: { branch_siNumber: { branch, siNumber } } })
  if (existing?.status === 'TAGGED' && existing.orderId) {
    await prisma.order.update({ where: { id: existing.orderId }, data: { salesInvoiceNumber: null, issuedOfficialInvoice: false } }).catch(() => {})
  }
  await prisma.salesInvoiceFlag.deleteMany({ where: { branch, siNumber } })
  return NextResponse.json({ success: true })
}
