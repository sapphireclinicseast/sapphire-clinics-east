import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?id=<referredPatientId> → the patient's recorded sessions from POS Orders:
// each order's service(s), date, and net amount paid. Matched by CRM patientId when
// available, else by patient name.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const rp = await prisma.referredPatient.findUnique({ where: { id }, select: { patientId: true, patientName: true } })
  if (!rp) return NextResponse.json({ error: 'Referred patient not found' }, { status: 404 })

  const match: Record<string, unknown>[] = []
  if (rp.patientId) match.push({ patientId: rp.patientId })
  if (rp.patientName) match.push({ patientName: { equals: rp.patientName, mode: 'insensitive' } })
  if (match.length === 0) return NextResponse.json({ patientName: rp.patientName, sessions: [], total: 0 })

  const orders = await prisma.order.findMany({
    where: { status: { notIn: ['VOIDED'] }, OR: match },
    orderBy: { transactionDate: 'desc' },
    select: {
      id: true, orderNumber: true, transactionDate: true, netAmount: true, branch: true, paymentStatus: true,
      items: { select: { name: true, quantity: true, lineTotal: true, service: { select: { department: true } } } },
    },
  })

  const sessions = orders.map(o => ({
    id: o.id,
    orderNumber: o.orderNumber,
    date: o.transactionDate,
    branch: o.branch,
    paymentStatus: o.paymentStatus,
    services: o.items.map(it => it.name).join(', ') || '—',
    departments: Array.from(new Set(o.items.map(it => it.service?.department).filter(Boolean))) as string[],
    netAmount: Number(o.netAmount),
  }))
  const total = sessions.reduce((s, x) => s + x.netAmount, 0)
  return NextResponse.json({ patientName: rp.patientName, sessions, total })
}
