// /api/accounts-receivable/clinician-payments
//
// HMO payments released straight to a doctor — an Intellicare/Avega PV for MD
// consults made out to the clinician, not to SCEI. Documentation only: no cash
// reaches us, so nothing posts to the GL, no wallet balance moves, and AR is
// untouched. The consult sessions a PV covers are linked so AR can show them as
// "paid direct".
//
// coursedThroughClinic (Hannah 2026-11-11): the one-off case where the HMO paid
// SCEI for the doctor's consults. Those consults become our sales/AR (tagged when
// the HMO payment is recorded) and an RFP payable to the doctor is prepared under
// 8190 for what the HMO paid us (netAmount) — lib/hmo-coursed-fee.
//
// GET                         → { payments }
// GET ?candidates=1&walletId=  → { candidates }  consult sessions not yet linked
// POST { walletId, clinicianName, pvNumber, pvDate, checkNumber, grossAmount,
//        vatAmount, wtaxAmount, netAmount, proofUrl, notes, branch, orderIds }
// PATCH { id, action: 'prepare-rfp', branch? }  → RFP for a coursed record that has none
// DELETE ?id=

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { createCoursedFeeRfp, makeConsultsOurSales, undoConsultSales, COURSED_FEE_SOURCE, RFP_BRANCH_CODE } from '@/lib/hmo-coursed-fee'

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'HMO_OFFICER']

const num = (v: unknown) => (Number.isFinite(Number(v)) ? Number(v) : 0)
const peso = (n: number) => `₱${n.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const manilaDay = (d: Date) => d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'Asia/Manila' })

/** The RFP that pays the doctor for a coursed record: what the HMO paid us. */
async function prepareRfp(p: { id: string; walletId: string; clinicianName: string; pvNumber: string | null; netAmount: unknown },
  orders: { id: string; orderNumber: number; patientName: string | null; transactionDate: Date }[],
  branch: string, userId: string | null) {
  const hmo = (await prisma.digitalWallet.findUnique({ where: { id: p.walletId }, select: { patientName: true } }))?.patientName || 'HMO'
  const amount = Math.round(num(p.netAmount) * 100) / 100
  const consults = orders.map(o => `${o.patientName || 'patient'} ${manilaDay(o.transactionDate)} #${o.orderNumber}`).join('; ')
  return prisma.$transaction(async tx => {
    const rfp = await createCoursedFeeRfp(tx, {
      branch,
      doctor: p.clinicianName,
      amount,
      description: `Doctor's fee coursed through the clinic — ${hmo}${p.pvNumber ? ` ${p.pvNumber}` : ''}: ${orders.length} consult${orders.length === 1 ? '' : 's'} (${consults}) — what the HMO paid us, ${peso(amount)}`,
      meta: { clinicianPaymentId: p.id, walletId: p.walletId, pvNumber: p.pvNumber, orderIds: orders.map(o => o.id) },
      userId,
    })
    await tx.clinicianHmoPayment.update({ where: { id: p.id }, data: { rfpId: rfp.id } })
    return rfp
  })
}

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
  const rfpIds = payments.map(p => p.rfpId).filter((id): id is string => !!id)
  const rfps = rfpIds.length
    ? await prisma.reimbursementReport.findMany({ where: { id: { in: rfpIds } }, select: { id: true, refNumber: true, status: true, branch: true } })
    : []
  const rfpOf = new Map(rfps.map(r => [r.id, r]))
  return NextResponse.json({
    payments: payments.map(p => ({
      id: p.id, walletId: p.walletId, hmo: hmoOf.get(p.walletId) || '', clinicianName: p.clinicianName,
      pvNumber: p.pvNumber, pvDate: p.pvDate.toISOString(), checkNumber: p.checkNumber,
      grossAmount: Number(p.grossAmount), vatAmount: Number(p.vatAmount), wtaxAmount: Number(p.wtaxAmount), netAmount: Number(p.netAmount),
      proofUrl: p.proofUrl, notes: p.notes, branch: p.branch, createdByName: p.createdByName, createdAt: p.createdAt.toISOString(),
      coursedThroughClinic: p.coursedThroughClinic,
      rfp: p.rfpId ? (rfpOf.get(p.rfpId) ?? { id: p.rfpId, refNumber: null, status: 'DELETED', branch: null }) : null,
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
    ? await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, patientName: true, netAmount: true, branch: true, transactionDate: true } })
    : []
  const coursed = b.coursedThroughClinic === true
  // Coursed through the clinic: the consults become our sales and the doctor is
  // paid by RFP from one branch, so both need consults and a paying branch.
  let rfpBranch = ''
  if (coursed) {
    if (!orders.length) return NextResponse.json({ error: 'Tick the consults the HMO paid the clinic for' }, { status: 400 })
    const branches = [...new Set(orders.map(o => o.branch).filter(br => RFP_BRANCH_CODE[br]))]
    rfpBranch = RFP_BRANCH_CODE[b.rfpBranch] ? b.rfpBranch : branches.length === 1 ? branches[0] : ''
    if (!rfpBranch) return NextResponse.json({ error: 'Choose the branch that pays the doctor (East or Greenhills)' }, { status: 400 })
    const net = b.netAmount != null && b.netAmount !== '' ? num(b.netAmount) : num(b.grossAmount) + num(b.vatAmount) - num(b.wtaxAmount)
    if (!(net > 0)) return NextResponse.json({ error: 'Enter the amount the HMO paid the clinic' }, { status: 400 })
  }
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
      branch: (coursed ? rfpBranch : b.branch) || null,
      coursedThroughClinic: coursed,
      createdById: session.user.id as string,
      createdByName: (session.user.name as string) || null,
      items: { create: orders.map(o => ({ orderId: o.id, patientName: o.patientName, amount: each })) },
    },
  })
  let rfpRef: string | null = null
  let gl: Record<string, string> = {}
  if (coursed) {
    await prisma.order.updateMany({ where: { id: { in: orders.map(o => o.id) } }, data: { hmoCoursedThroughClinic: true } })
    gl = await makeConsultsOurSales(prisma, orders.map(o => o.id), session.user.id as string)
    try {
      rfpRef = (await prepareRfp(payment, orders, rfpBranch, session.user.id ?? null)).refNumber
    } catch (e) {
      console.error('[clinician-payments] RFP for coursed fee failed:', e)
    }
  }
  await prisma.auditLog.create({
    data: {
      userId: session.user.id as string, action: 'CREATE', entity: 'clinicianHmoPayment', entityId: payment.id,
      details: { pvNumber: payment.pvNumber, clinicianName: payment.clinicianName, netAmount: num(b.netAmount), sessions: orders.length, coursedThroughClinic: coursed, rfpRef, gl },
    },
  })
  return NextResponse.json({ id: payment.id, rfpRef, gl, rfpError: coursed && !rfpRef ? 'Saved, but the RFP could not be prepared — use Prepare RFP on the row.' : undefined }, { status: 201 })
}

export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const p = await prisma.clinicianHmoPayment.findUnique({ where: { id }, include: { items: { select: { orderId: true } } } })
  if (!p) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  const orderIds = p.items.map(i => i.orderId).filter((x): x is string => !!x)
  let gl: Record<string, string> = {}
  if (p.coursedThroughClinic) {
    // The consults are our sales now: a recorded HMO payment or a paid RFP must
    // be undone first, or cash and the doctor's fee would be left hanging.
    if (orderIds.length && await prisma.aRPaymentItem.findFirst({ where: { orderId: { in: orderIds } }, select: { id: true } })) {
      return NextResponse.json({ error: 'These consults are tagged on a recorded HMO payment. Untag them there first.' }, { status: 409 })
    }
    const rfp = p.rfpId ? await prisma.reimbursementReport.findUnique({ where: { id: p.rfpId }, select: { id: true, status: true, refNumber: true } }) : null
    if (rfp?.status === 'PAID') {
      return NextResponse.json({ error: `RFP ${rfp.refNumber} to the doctor is already paid. Mark it unpaid in Expenses → RFP first.` }, { status: 409 })
    }
    if (rfp) {
      await prisma.pettyCashEntry.deleteMany({ where: { reimbursementId: rfp.id } })
      await prisma.reimbursementReport.delete({ where: { id: rfp.id } })
    }
    gl = await undoConsultSales(prisma, orderIds, session.user.id as string)
  }
  await prisma.clinicianHmoPayment.delete({ where: { id } })
  await prisma.auditLog.create({ data: { userId: session.user.id as string, action: 'DELETE', entity: 'clinicianHmoPayment', entityId: id, details: { coursedThroughClinic: p.coursedThroughClinic, gl } } })
  return NextResponse.json({ ok: true, gl })
}

export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const b = await req.json().catch(() => ({}))
  if (b.action !== 'prepare-rfp' || typeof b.id !== 'string') return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
  const p = await prisma.clinicianHmoPayment.findUnique({ where: { id: b.id }, include: { items: { select: { orderId: true } } } })
  if (!p) return NextResponse.json({ error: 'Record not found' }, { status: 404 })
  if (!p.coursedThroughClinic) return NextResponse.json({ error: 'Only payments coursed through the clinic get an RFP' }, { status: 400 })
  if (p.rfpId && await prisma.reimbursementReport.findUnique({ where: { id: p.rfpId }, select: { id: true } })) {
    return NextResponse.json({ error: 'This payment already has an RFP' }, { status: 409 })
  }
  const orderIds = p.items.map(i => i.orderId).filter((x): x is string => !!x)
  const orders = await prisma.order.findMany({ where: { id: { in: orderIds } }, select: { id: true, orderNumber: true, patientName: true, transactionDate: true, branch: true } })
  const branch = RFP_BRANCH_CODE[b.branch] ? b.branch : RFP_BRANCH_CODE[p.branch || ''] ? p.branch as string : ''
  if (!branch) return NextResponse.json({ error: 'Choose the branch that pays the doctor (East or Greenhills)' }, { status: 400 })
  const rfp = await prepareRfp(p, orders, branch, session.user.id ?? null)
  await prisma.auditLog.create({ data: { userId: session.user.id as string, action: 'CREATE', entity: 'clinicianHmoPayment-rfp', entityId: p.id, details: { rfp: rfp.refNumber, source: COURSED_FEE_SOURCE } } })
  return NextResponse.json({ rfpRef: rfp.refNumber })
}
