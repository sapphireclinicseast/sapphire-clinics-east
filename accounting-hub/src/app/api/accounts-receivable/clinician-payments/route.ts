// /api/accounts-receivable/clinician-payments
//
// HMO payments released straight to a doctor — an Intellicare/Avega PV for MD
// consults made out to the clinician, not to SCEI. Documentation only: no cash
// reaches us, so nothing posts to the GL, no wallet balance moves, and AR is
// untouched. The consult sessions a PV covers are linked so AR can show them as
// "paid direct".
//
// GET                         → { payments }
// GET ?candidates=1&walletId=  → { candidates }  consult sessions not yet linked
// POST { walletId, clinicianName, pvNumber, pvDate, checkNumber, grossAmount,
//        vatAmount, wtaxAmount, netAmount, proofUrl, notes, branch, orderIds }
// DELETE ?id=

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const sp = new URL(req.url).searchParams

  if (sp.get('candidates') === '1') {
    const walletId = sp.get('walletId') || ''
    if (!walletId) return NextResponse.json({ candidates: [] })
    const linked = await prisma.clinicianHmoPaymentItem.findMany({ where: { orderId: { not: null } }, select: { orderId: true } })
    const orders = await prisma.order.findMany({
      where: {
        status: { not: 'VOIDED' },
        id: { notIn: linked.map(l => l.orderId as string) },
        payments: { some: { method: 'HMO', walletId } },
        // Doctor consults: an MD-department service, or one the HMO pays the clinician for.
        items: { some: { service: { is: { OR: [{ department: 'MD' }, { hmoPaysClinicianDirect: true }] } } } },
      },
      select: { id: true, orderNumber: true, transactionDate: true, patientName: true, clinicianName: true, netAmount: true },
      orderBy: { transactionDate: 'desc' },
      take: 2000,
    })
    return NextResponse.json({
      candidates: orders.map(o => ({
        id: o.id, orderNumber: o.orderNumber, date: o.transactionDate.toISOString(),
        patientName: o.patientName || '', clinicianName: o.clinicianName || '', amount: Number(o.netAmount),
      })),
    })
  }

  const payments = await prisma.clinicianHmoPayment.findMany({
    include: { items: true },
    orderBy: { pvDate: 'desc' },
  })
  const orderIds = payments.flatMap(p => p.items.map(i => i.orderId)).filter((id): id is string => !!id)
  const orders = orderIds.length
    ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, transactionDate: true } })
    : []
  const orderOf = new Map(orders.map(o => [o.id, o]))
  const wallets = await prisma.digitalWallet.findMany({
    where: { id: { in: [...new Set(payments.map(p => p.walletId))] } },
    select: { id: true, patientName: true },
  })
  const hmoOf = new Map(wallets.map(w => [w.id, w.patientName || '']))
  return NextResponse.json({
    payments: payments.map(p => ({
      id: p.id, walletId: p.walletId, hmo: hmoOf.get(p.walletId) || '', clinicianName: p.clinicianName,
      pvNumber: p.pvNumber, pvDate: p.pvDate.toISOString(), checkNumber: p.checkNumber,
      grossAmount: Number(p.grossAmount), vatAmount: Number(p.vatAmount), wtaxAmount: Number(p.wtaxAmount), netAmount: Number(p.netAmount),
      proofUrl: p.proofUrl, notes: p.notes, branch: p.branch, createdByName: p.createdByName, createdAt: p.createdAt.toISOString(),
      items: p.items.map(i => {
        const o = i.orderId ? orderOf.get(i.orderId) : undefined
        return {
          id: i.id, orderId: i.orderId, orderNumber: o?.orderNumber ?? null,
          sessionDate: o?.transactionDate.toISOString() ?? null, patientName: i.patientName,
          loaNumber: i.loaNumber, loaDate: i.loaDate?.toISOString() ?? null, amount: Number(i.amount),
        }
      }),
    })),
  })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const b = await req.json()
  if (!b.walletId || !String(b.clinicianName || '').trim() || !b.pvDate) {
    return NextResponse.json({ error: 'HMO, doctor and PV date are required' }, { status: 400 })
  }
  const orderIds: string[] = Array.isArray(b.orderIds) ? b.orderIds.filter((x: unknown) => typeof x === 'string') : []
  const orders = orderIds.length
    ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, patientName: true, netAmount: true } })
    : []
  const taken = orderIds.length
    ? await prisma.clinicianHmoPaymentItem.findFirst({ where: { orderId: { in: orderIds } }, select: { orderId: true } })
    : null
  if (taken) return NextResponse.json({ error: 'One of those consults is already on another doctor payment' }, { status: 400 })
  // Split the gross evenly across the sessions it covers (PVs list a flat PF per consult).
  const gross = num(b.grossAmount)
  const each = orders.length ? Math.round((gross / orders.length) * 100) / 100 : 0

  const payment = await prisma.clinicianHmoPayment.create({
    data: {
      walletId: b.walletId,
      clinicianName: String(b.clinicianName).trim(),
      pvNumber: b.pvNumber ? String(b.pvNumber).trim() : null,
      pvDate: new Date(b.pvDate),
      checkNumber: b.checkNumber ? String(b.checkNumber).trim() : null,
      grossAmount: gross,
      vatAmount: num(b.vatAmount),
      wtaxAmount: num(b.wtaxAmount),
      netAmount: b.netAmount != null && b.netAmount !== '' ? num(b.netAmount) : gross + num(b.vatAmount) - num(b.wtaxAmount),
      proofUrl: b.proofUrl || null,
      notes: b.notes ? String(b.notes).trim() : null,
      branch: b.branch || null,
      createdById: session.user.id as string,
      createdByName: (session.user.name as string) || null,
      items: { create: orders.map(o => ({ orderId: o.id, patientName: o.patientName, amount: each })) },
    },
  })
  await prisma.auditLog.create({
    data: {
      userId: session.user.id as string, action: 'CREATE', entity: 'clinicianHmoPayment', entityId: payment.id,
      details: { pvNumber: payment.pvNumber, clinicianName: payment.clinicianName, netAmount: num(b.netAmount), sessions: orders.length },
    },
  })
  return NextResponse.json({ id: payment.id }, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  await prisma.clinicianHmoPayment.delete({ where: { id } })
  await prisma.auditLog.create({ data: { userId: session.user.id as string, action: 'DELETE', entity: 'clinicianHmoPayment', entityId: id, details: {} } })
  return NextResponse.json({ ok: true })
}
