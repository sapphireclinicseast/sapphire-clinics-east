// The sessions an AR payment settled — Payment History's "N orders" popup
// (Hannah 2026-11-19: "allow me to click the orders here and popup on what
// sessions were included (date, name of patient, total money, hmo, clinician)").
//
// GET ?id=<ARPayment id> → the payment's head (reference, date, payer, amount)
// and one row per tagged order. The amount on a row is what the order billed to
// this payment's payer (its HMO / GL payment lines on that wallet), the same
// figure the AR session list shows; `total` is the whole order, for a session
// split with cash or another payer.
//
// Read-only. The table on the page holds only the sessions inside its current
// filters, so the popup reads them here instead of from the page.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { arRefOf } from '@/lib/ar-ref'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const HMO_ONLY_ROLES = ['HMO_OFFICER']

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'Which payment?' }, { status: 400 })

  const payment = await prisma.aRPayment.findUnique({
    where: { id },
    select: {
      id: true, walletId: true, paymentDate: true, amount: true, discount: true, notes: true,
      wallet: { select: { patientName: true, walletType: true } },
      items: {
        select: {
          order: {
            select: {
              id: true, orderNumber: true, transactionDate: true, patientName: true, clinicianName: true,
              status: true, branch: true, netAmount: true,
              items: { select: { name: true } },
              payments: { select: { amount: true, walletId: true, wallet: { select: { patientName: true } } } },
            },
          },
        },
      },
    },
  })
  if (!payment) return NextResponse.json({ error: 'Payment not found' }, { status: 404 })
  if (HMO_ONLY_ROLES.includes(session.user.role as string) && payment.wallet?.walletType !== 'HMO') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rows = payment.items
    .map(i => i.order)
    .filter((o): o is NonNullable<typeof o> => !!o)
    .map(o => {
      const own = o.payments.filter(p => p.walletId === payment.walletId)
      const billed = own.reduce((s, p) => s + Number(p.amount), 0)
      // The payer named on the order: this payment's wallet when the order
      // bills it, else whichever HMO/GL wallet the order does bill.
      const hmo = own[0]?.wallet?.patientName
        || o.payments.find(p => p.walletId)?.wallet?.patientName
        || payment.wallet?.patientName || ''
      return {
        orderId: o.id,
        orderNumber: o.orderNumber,
        date: o.transactionDate.toISOString(),
        patientName: o.patientName || '',
        clinicianName: o.clinicianName || '',
        hmo,
        amount: own.length ? billed : Number(o.netAmount),
        total: Number(o.netAmount),
        status: o.status,
        branch: o.branch,
        services: o.items.map(it => it.name),
      }
    })
    .sort((a, b) => a.date.localeCompare(b.date) || a.orderNumber - b.orderNumber)

  return NextResponse.json({
    payment: {
      id: payment.id,
      ref: arRefOf(payment.notes),
      date: payment.paymentDate.toISOString(),
      payer: payment.wallet?.patientName || '',
      amount: Number(payment.amount),
      discount: Number(payment.discount),
    },
    rows,
    total: rows.reduce((s, r) => s + r.amount, 0),
  })
}
