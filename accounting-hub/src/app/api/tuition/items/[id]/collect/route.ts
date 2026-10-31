// POST /api/tuition/items/[id]/collect — put a scheduled promissory payment in
// the POS queue. Opens the Class Hub front-desk payment row for it (shown in the
// queue as `clsp_tpp_<itemId>`); the cashier converts it like any tuition item,
// which records the sale and turns the payment PAID in Class Hub. Safe to repeat.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'
import { planItemPaymentId, semesterLabel, toYmd } from '@/lib/tuition'
import { TUITION_COLLECT_ROLES, openClassHubPayment } from '@/lib/tuition-server'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!TUITION_COLLECT_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const item = await prisma.tuitionPaymentPlanItem.findUnique({
    where: { id },
    include: { plan: { include: { items: { select: { id: true } } } } },
  })
  if (!item) return NextResponse.json({ error: 'Scheduled payment not found.' }, { status: 404 })
  if (item.plan.status !== 'ACTIVE') return NextResponse.json({ error: 'This plan was cancelled.' }, { status: 409 })
  if (!branchAllowed(user.branch, item.plan.branch, user.branches)) {
    return NextResponse.json({ error: 'This student is outside your branch.' }, { status: 403 })
  }
  if (item.classPortalPaymentId) return NextResponse.json({ classPortalPaymentId: item.classPortalPaymentId, alreadyQueued: true })

  const classPortalPaymentId = planItemPaymentId(item.id)
  try {
    await openClassHubPayment({
      classPortalPaymentId,
      studentId: item.plan.studentId,
      amountCentavos: Math.round(Number(item.amount) * 100),
      period: `Promissory payment ${item.seq} of ${item.plan.items.length} · ${semesterLabel(item.plan.schoolYear, item.plan.semester)}`,
      notes: `Scheduled for ${toYmd(item.dueDate)} under the promissory note (Accounting Hub → AR → Tuition).`,
    })
  } catch (e) {
    return NextResponse.json({ error: `Could not reach Class Hub: ${(e as Error).message}` }, { status: 502 })
  }
  await prisma.tuitionPaymentPlanItem.update({ where: { id: item.id }, data: { classPortalPaymentId } })
  return NextResponse.json({ classPortalPaymentId })
}
