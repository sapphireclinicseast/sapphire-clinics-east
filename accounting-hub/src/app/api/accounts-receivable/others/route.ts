import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK']

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function serialize(r: any) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const paid = (r.payments || []).reduce((s: number, p: any) => s + Number(p.amount), 0)
  return {
    id: r.id, branch: r.branch, customerName: r.customerName,
    orderId: r.orderId, orderNumber: r.order?.orderNumber ?? null,
    principal: Number(r.principal), totalDue: Number(r.totalDue),
    months: r.months, interestType: r.interestType,
    interestValue: r.interestValue != null ? Number(r.interestValue) : null,
    monthlyAmount: r.monthlyAmount != null ? Number(r.monthlyAmount) : null,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
    notes: r.notes, status: r.status, createdAt: r.createdAt,
    paid, balance: Number(r.totalDue) - paid,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payments: (r.payments || []).map((p: any) => ({
      id: p.id, date: p.date.toISOString().slice(0, 10), amount: Number(p.amount),
      method: p.method, reference: p.reference, proofUrl: p.proofUrl, notes: p.notes,
    })),
  }
}

const INCLUDE = { payments: { orderBy: { date: 'asc' as const } }, order: { select: { orderNumber: true } } }

// After any payment change, settle/reopen the receivable and mirror onto the
// linked order: settled → order PAID (paymentDate = last installment), else UNPAID.
async function refreshStatus(id: string) {
  const r = await prisma.otherReceivable.findUnique({ where: { id }, include: { payments: true } })
  if (!r) return
  const paid = r.payments.reduce((s, p) => s + Number(p.amount), 0)
  const settled = paid >= Number(r.totalDue) - 0.005 && Number(r.totalDue) > 0
  await prisma.otherReceivable.update({ where: { id }, data: { status: settled ? 'SETTLED' : 'OPEN' } })
  if (r.orderId) {
    const lastDate = r.payments.map(p => p.date).sort((a, b) => b.getTime() - a.getTime())[0] || new Date()
    await prisma.order.update({
      where: { id: r.orderId },
      data: settled ? { paymentStatus: 'PAID', paymentDate: lastDate } : { paymentStatus: 'UNPAID', paymentDate: null },
    }).catch(() => {})
  }
}

// GET [?branch=][&status=] — list other receivables with payments + balances
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sp = new URL(req.url).searchParams
  const branch = sp.get('branch') || ''
  const status = sp.get('status') || ''
  const rows = await prisma.otherReceivable.findMany({
    where: { ...(branch ? { branch } : {}), ...(status ? { status } : {}) },
    include: INCLUDE,
    orderBy: { createdAt: 'desc' },
  })
  return NextResponse.json(rows.map(serialize))
}

// POST { branch, customerName, principal, notes?, orderId? } — manual receivable
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, customerName, principal, notes, orderId } = await req.json()
    const amt = Number(principal)
    if (!branch || !customerName?.trim() || !(amt > 0)) {
      return NextResponse.json({ error: 'Branch, customer and a positive amount are required' }, { status: 400 })
    }
    const created = await prisma.otherReceivable.create({
      data: {
        branch, customerName: customerName.trim(), principal: amt, totalDue: amt,
        orderId: orderId || null, notes: notes?.trim() || null, createdById: session.user.id ?? null,
      },
      include: INCLUDE,
    })
    return NextResponse.json(serialize(created), { status: 201 })
  } catch (e) {
    console.error('OtherReceivable create error:', e)
    return NextResponse.json({ error: 'Failed to create receivable' }, { status: 500 })
  }
}

// PATCH { id, action } — 'plan' | 'clear-plan' | 'payment' | 'delete-payment'
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const body = await req.json()
    const { id, action } = body
    const rec = id ? await prisma.otherReceivable.findUnique({ where: { id } }) : null
    if (!rec) return NextResponse.json({ error: 'Receivable not found' }, { status: 404 })

    if (action === 'plan') {
      // Staggered plan: months + optional interest (percent of principal, or an
      // absolute peso add-on). totalDue = principal + interest; monthly = totalDue/months.
      const months = parseInt(String(body.months), 10)
      if (!(months > 0)) return NextResponse.json({ error: 'Months must be at least 1' }, { status: 400 })
      const interestType = body.interestType === 'PERCENT' ? 'PERCENT' : body.interestType === 'ABSOLUTE' ? 'ABSOLUTE' : null
      const interestValue = interestType ? Number(body.interestValue) || 0 : null
      const principal = Number(rec.principal)
      const interest = interestType === 'PERCENT' ? principal * ((interestValue || 0) / 100) : (interestType === 'ABSOLUTE' ? (interestValue || 0) : 0)
      const totalDue = principal + interest
      await prisma.otherReceivable.update({
        where: { id },
        data: {
          months, interestType, interestValue,
          totalDue, monthlyAmount: totalDue / months,
          startDate: body.startDate ? new Date(`${String(body.startDate).slice(0, 10)}T00:00:00+08:00`) : null,
        },
      })
      await refreshStatus(id)
    } else if (action === 'clear-plan') {
      await prisma.otherReceivable.update({
        where: { id },
        data: { months: null, interestType: null, interestValue: null, totalDue: rec.principal, monthlyAmount: null, startDate: null },
      })
      await refreshStatus(id)
    } else if (action === 'payment') {
      const amount = Number(body.amount)
      if (!(amount > 0)) return NextResponse.json({ error: 'Payment amount must be positive' }, { status: 400 })
      await prisma.otherReceivablePayment.create({
        data: {
          receivableId: id,
          date: new Date(`${String(body.date || new Date().toISOString()).slice(0, 10)}T08:00:00+08:00`),
          amount, method: body.method || null, reference: body.reference || null,
          proofUrl: body.proofUrl || null, notes: body.notes || null,
          createdById: session.user.id ?? null,
        },
      })
      await refreshStatus(id)
    } else if (action === 'delete-payment') {
      if (!body.paymentId) return NextResponse.json({ error: 'paymentId is required' }, { status: 400 })
      await prisma.otherReceivablePayment.delete({ where: { id: body.paymentId } })
      await refreshStatus(id)
    } else if (action === 'edit') {
      await prisma.otherReceivable.update({
        where: { id },
        data: {
          ...(body.customerName?.trim() ? { customerName: body.customerName.trim() } : {}),
          ...(body.notes !== undefined ? { notes: body.notes?.trim() || null } : {}),
        },
      })
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 })
    }

    const fresh = await prisma.otherReceivable.findUnique({ where: { id }, include: INCLUDE })
    return NextResponse.json(serialize(fresh))
  } catch (e) {
    console.error('OtherReceivable patch error:', e)
    return NextResponse.json({ error: 'Failed to update receivable' }, { status: 500 })
  }
}

// DELETE ?id= — only when no payments are recorded
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const id = new URL(req.url).searchParams.get('id') || ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const count = await prisma.otherReceivablePayment.count({ where: { receivableId: id } })
  if (count > 0) return NextResponse.json({ error: 'Delete its payments first' }, { status: 409 })
  await prisma.otherReceivable.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
