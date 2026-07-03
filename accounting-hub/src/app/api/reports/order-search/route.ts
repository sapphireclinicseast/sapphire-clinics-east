import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE']

// GET ?branch=&q= — unlabeled orders (no Sales Invoice) matching a free-text query
// across patient name, date (YYYY-MM-DD), service name, amount, or payment mode.
// Used by the "Tag to Order" resolver in Sales Summary → With SI.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const q = (sp.get('q') || '').trim()
  if (!VALID_BRANCHES.includes(branch)) return NextResponse.json({ error: 'Select a branch' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = { branch, status: { in: ['COMPLETED', 'REOPENED'] }, salesInvoiceNumber: null }
  if (q) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const or: any[] = [
      { patientName: { contains: q, mode: 'insensitive' } },
      { items: { some: { name: { contains: q, mode: 'insensitive' } } } },
      { payments: { some: { paymentMode: { name: { contains: q, mode: 'insensitive' } } } } },
    ]
    const amt = parseFloat(q.replace(/[^\d.]/g, ''))
    if (isFinite(amt) && amt > 0) or.push({ netAmount: amt })
    if (/^\d{4}-\d{2}-\d{2}$/.test(q)) {
      or.push({ transactionDate: { gte: new Date(`${q}T00:00:00+08:00`), lte: new Date(`${q}T23:59:59.999+08:00`) } })
    }
    where.OR = or
  }

  try {
    const orders = await prisma.order.findMany({
      where, orderBy: { transactionDate: 'desc' }, take: 25,
      select: {
        id: true, orderNumber: true, transactionDate: true, patientName: true, netAmount: true,
        items: { select: { name: true }, take: 4 },
        payments: { select: { method: true, paymentMode: { select: { name: true } } }, take: 2 },
      },
    })
    return NextResponse.json({
      orders: orders.map(o => ({
        id: o.id, orderNumber: o.orderNumber,
        date: new Date(o.transactionDate).toLocaleDateString('en-PH', { timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit' }),
        patientName: o.patientName || '—',
        services: o.items.map(i => i.name).join(', '),
        amount: Number(o.netAmount),
        payment: o.payments.map(p => p.paymentMode?.name || p.method).filter(Boolean).join(', '),
      })),
    })
  } catch (err) {
    console.error('Order search error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
