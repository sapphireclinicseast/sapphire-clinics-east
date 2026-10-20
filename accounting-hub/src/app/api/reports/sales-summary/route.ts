import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { enforceBranch } from '@/lib/branch-scope'
import { parseMonitoringRemark } from '@/lib/si-monitoring'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  // Branch-scoped users (e.g. front desk) may only ever see their own branch,
  // regardless of the requested branch param.
  const forcedBranch = enforceBranch((session.user as { branch?: string; branches?: string[] }).branch, (session.user as { branches?: string[] }).branches, searchParams.get('branch'))
  const branch = forcedBranch ?? (searchParams.get('branch') || '')
  const dateFrom = searchParams.get('dateFrom') || ''
  const dateTo = searchParams.get('dateTo') || ''
  const invoicedOnly = searchParams.get('invoicedOnly') === 'true'

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {
    status: { in: ['COMPLETED', 'REOPENED'] },
  }

  if (branch && branch !== 'ALL') where.branch = branch
  if (dateFrom) {
    where.transactionDate = { ...where.transactionDate, gte: new Date(`${dateFrom}T00:00:00+08:00`) }
  }
  if (dateTo) {
    where.transactionDate = { ...where.transactionDate, lte: new Date(`${dateTo}T23:59:59.999+08:00`) }
  }
  if (invoicedOnly) {
    where.issuedOfficialInvoice = true
  }

  try {
    const orders = await prisma.order.findMany({
      where,
      orderBy: { transactionDate: 'asc' },
      select: {
        id: true,
        orderNumber: true,
        transactionDate: true,
        patientName: true,
        subtotal: true,
        discountAmount: true,
        netAmount: true,
        branch: true,
        issuedOfficialInvoice: true,
        salesInvoiceNumber: true,
        items: {
          select: {
            name: true,
            quantity: true,
            lineTotal: true,
            service: { select: { issuedOfficialInvoice: true } },
            inventoryItem: { select: { issuedOfficialInvoice: true } },
          },
        },
      },
    })

    // Flatten: one row per order item
    const rows = orders.flatMap(order => {
      const date = new Date(order.transactionDate).toLocaleDateString('en-PH', {
        timeZone: 'Asia/Manila',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      })

      // Distribute discount proportionally across items
      const orderGross = Number(order.subtotal)
      const orderNet = Number(order.netAmount)
      const discountRatio = orderGross > 0 ? (Number(order.discountAmount) / orderGross) : 0

      return order.items.map(item => {
        const itemGross = Number(item.lineTotal)
        const itemDiscount = itemGross * discountRatio
        const itemNet = itemGross - itemDiscount
        return {
          date,
          orderId: order.id,
          orderNumber: order.orderNumber,
          patientName: order.patientName || '—',
          serviceAvailed: item.name,
          quantity: item.quantity,
          salesInvoiceNumber: order.salesInvoiceNumber || '',
          grossAmount: itemGross,
          netAmount: itemNet,
          branch: order.branch,
          issuedOfficialInvoice: order.issuedOfficialInvoice,
          itemIssuedOfficialInvoice: item.service?.issuedOfficialInvoice || item.inventoryItem?.issuedOfficialInvoice || false,
        }
      })
    })

    /* ── Migrated invoices from the manual SI monitoring workbook ──────
       Pre-hub sales exist only as SalesInvoiceFlag REMARKS rows (no Order),
       with date/customer/amount encoded in the standardized remark text.
       Surface them here so the report covers the SI series from the very
       start. CANCELLED and TAGGED flags are skipped (not sales / already an
       order). Rows whose remark carries no amount (blank workbook lines)
       are skipped too — there is nothing to report.
       Date filter: a dated row must fall inside the window; an undated row
       (a handful of corporate SIs) is always included rather than silently
       dropping real invoiced amounts. */
    const flags = await prisma.salesInvoiceFlag.findMany({
      where: { status: 'REMARKS', ...(branch && branch !== 'ALL' ? { branch } : {}) },
    })
    const migratedRows = flags.flatMap(f => {
      const info = parseMonitoringRemark(f.remarks)
      if (!info || info.amount == null || info.amount <= 0) return []
      // Workbook date first; a declared (SI-book) date set on the row in With SI
      // fills in for the many workbook lines that carried no date at all.
      const bookDate = info.date || (f.declaredDate ? new Date(f.declaredDate).toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' }) : null)
      if (bookDate) {
        if (dateFrom && bookDate < dateFrom) return []
        if (dateTo && bookDate > dateTo) return []
      }
      const date = bookDate
        ? new Date(`${bookDate}T12:00:00+08:00`).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' })
        : '—'
      return [{
        date,
        orderNumber: 0,
        patientName: info.customer || '—',
        serviceAvailed: `Migrated — manual SI monitoring (${info.tab})`,
        quantity: 1,
        salesInvoiceNumber: f.siNumber,
        grossAmount: info.amount,
        netAmount: info.netAmount ?? info.amount,
        branch: f.branch,
        issuedOfficialInvoice: true,
        itemIssuedOfficialInvoice: false,
        migrated: true,
        ar: false,
      }]
    })

    /* ── HMO / AR collections issued a Sales Invoice on payment ─────────
       Accounts Receivable → Record Payment can issue an SI; those invoices are
       part of the same SI series the With-SI book counts, so the invoiced-only
       view includes them (dated by payment date, like orders by sale date).
       Gross of the waived discount — the invoice covers the full service value. */
    const arRows: typeof migratedRows = []
    if (invoicedOnly) {
      const arPayments = await prisma.aRPayment.findMany({
        where: {
          salesInvoiceNumber: { not: null },
          ...(branch && branch !== 'ALL' ? { branch } : {}),
          ...(dateFrom || dateTo ? { paymentDate: { ...(dateFrom ? { gte: new Date(`${dateFrom}T00:00:00+08:00`) } : {}), ...(dateTo ? { lte: new Date(`${dateTo}T23:59:59.999+08:00`) } : {}) } } : {}),
        },
        orderBy: { paymentDate: 'asc' },
        select: { id: true, salesInvoiceNumber: true, paymentDate: true, amount: true, discount: true, branch: true, wallet: { select: { patientName: true, walletType: true } } },
      })
      for (const p of arPayments) {
        const gross = Number(p.amount) + Number(p.discount)
        arRows.push({
          date: new Date(p.paymentDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }),
          orderNumber: 0,
          patientName: `${p.wallet?.patientName || '—'} (${p.wallet?.walletType || 'AR'})`,
          serviceAvailed: `HMO / AR collection — Sales Invoice issued on payment`,
          quantity: 1,
          salesInvoiceNumber: p.salesInvoiceNumber || '',
          grossAmount: gross,
          netAmount: gross,
          branch: p.branch || '',
          issuedOfficialInvoice: true,
          itemIssuedOfficialInvoice: false,
          migrated: false,
          ar: true,
        })
      }
    }

    return NextResponse.json({ rows: [...rows, ...migratedRows, ...arRows], count: rows.length + migratedRows.length + arRows.length, migratedCount: migratedRows.length, arCount: arRows.length })
  } catch (err) {
    console.error('Sales summary error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
