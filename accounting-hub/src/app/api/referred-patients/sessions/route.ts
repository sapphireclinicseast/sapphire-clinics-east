import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { nameKey, nameVariants, longestToken } from '@/lib/patient-name-match'

// GET ?id=<referredPatientId> → the patient's recorded sessions from POS Orders:
// each order's service(s), date, and net amount paid. Matched by CRM patientId when
// available, else by patient name — word-order-insensitively, because orders are
// often keyed surname-first ("POMALOY FEMARIE KATE") while the referral list holds
// the name first-name-first, and many orders carry no CRM patientId at all.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })

  const rp = await prisma.referredPatient.findUnique({ where: { id }, select: { patientId: true, patientName: true } })
  if (!rp) return NextResponse.json({ error: 'Referred patient not found' }, { status: 404 })

  const match: Record<string, unknown>[] = []
  if (rp.patientId) match.push({ patientId: rp.patientId })
  if (rp.patientName) {
    match.push({ patientName: { in: nameVariants(rp.patientName), mode: 'insensitive' } })
    // Wide net for any spelling the variants missed; precise token-set filter below.
    const token = longestToken(rp.patientName)
    if (token) match.push({ patientName: { contains: token, mode: 'insensitive' } })
  }
  if (match.length === 0) return NextResponse.json({ patientName: rp.patientName, sessions: [], total: 0 })

  // Earned revenue only: package payments and prepaid-card reloads are
  // UNEARNED orders, not sessions — exclude them from the list and total.
  const rpKey = nameKey(rp.patientName)
  const orders = (await prisma.order.findMany({
    where: { status: { notIn: ['VOIDED'] }, revenueType: { not: 'UNEARNED' }, OR: match },
    orderBy: { transactionDate: 'desc' },
    select: {
      id: true, orderNumber: true, transactionDate: true, netAmount: true, branch: true, paymentStatus: true, patientId: true, patientName: true,
      items: { select: { name: true, quantity: true, lineTotal: true, service: { select: { department: true } } } },
    },
  })).filter((o) => (rp.patientId && o.patientId === rp.patientId) || (rpKey && nameKey(o.patientName) === rpKey))

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
