// PUT /api/tuition/plans/[id] — edit a schedule (same body as POST, items may
// carry their id). Payments already sent to the POS queue are locked: they
// stay as they are, and the rest of the schedule is rebuilt around them.
// DELETE /api/tuition/plans/[id] — cancel the plan, unless a payment is still
// waiting in the POS queue.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'
import { cleanPlanItems, fromYmd, planProblem, semesterOf, toYmd, type PlanBody } from '@/lib/tuition'
import { TUITION_WRITE_ROLES, loadPlans, planViews } from '@/lib/tuition-server'

async function gate(id: string) {
  const session = await auth()
  if (!session?.user) return { error: NextResponse.json({ error: 'Unauthorized' }, { status: 401 }) }
  const user = session.user as { role?: string; branch?: string; branches?: string[] }
  if (!TUITION_WRITE_ROLES.includes(user.role ?? '')) return { error: NextResponse.json({ error: 'Forbidden' }, { status: 403 }) }
  const [plan] = await loadPlans({ id })
  if (!plan) return { error: NextResponse.json({ error: 'Plan not found.' }, { status: 404 }) }
  if (!branchAllowed(user.branch, plan.branch, user.branches)) return { error: NextResponse.json({ error: 'This plan is outside your branch.' }, { status: 403 }) }
  if (plan.status !== 'ACTIVE') return { error: NextResponse.json({ error: 'This plan was cancelled.' }, { status: 409 }) }
  return { plan }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await gate(id)
  if (g.error) return g.error
  const plan = g.plan!
  const body = await req.json().catch(() => ({})) as PlanBody
  const items = cleanPlanItems(body.items)
  const amount = Math.round(Number(body.amount) * 100) / 100
  const problem = planProblem({ originalDueDate: body.originalDueDate || '', amount, items })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const sem = semesterOf(body.originalDueDate!)!

  const locked = plan.items.filter(i => i.classPortalPaymentId)
  for (const l of locked) {
    const sent = items.find(i => i.id === l.id)
    if (!sent || sent.dueDate !== toYmd(l.dueDate) || Math.abs(sent.amount - Number(l.amount)) > 0.005) {
      return NextResponse.json({ error: `Payment ${l.seq} (₱${Number(l.amount).toLocaleString('en-PH', { minimumFractionDigits: 2 })}, ${toYmd(l.dueDate)}) is already in the POS queue and can't be changed or removed.` }, { status: 409 })
    }
  }
  if (locked.length && (sem.schoolYear !== plan.schoolYear || sem.semester !== plan.semester)) {
    return NextResponse.json({ error: 'A payment is already in the POS queue, so the plan cannot move to another semester.' }, { status: 409 })
  }

  const lockedIds = new Set(locked.map(l => l.id))
  await prisma.$transaction(async tx => {
    await tx.tuitionPaymentPlanItem.deleteMany({ where: { planId: plan.id, id: { notIn: [...lockedIds] } } })
    // Number the schedule by date, keeping the locked rows' ids.
    for (const [i, it] of items.entries()) {
      if (it.id && lockedIds.has(it.id)) await tx.tuitionPaymentPlanItem.update({ where: { id: it.id }, data: { seq: i + 1 } })
      else await tx.tuitionPaymentPlanItem.create({ data: { planId: plan.id, seq: i + 1, dueDate: fromYmd(it.dueDate), amount: it.amount } })
    }
    await tx.tuitionPaymentPlan.update({
      where: { id: plan.id },
      data: {
        schoolYear: sem.schoolYear, semester: sem.semester, originalDueDate: fromYmd(body.originalDueDate!),
        amount, notes: body.notes?.trim() || null,
      },
    })
  })
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const g = await gate(id)
  if (g.error) return g.error
  const [view] = await planViews([g.plan!])
  if (view.items.some(i => i.inPos)) {
    return NextResponse.json({ error: 'A payment from this plan is waiting in the POS queue. Complete or delete it there first.' }, { status: 409 })
  }
  await prisma.tuitionPaymentPlan.update({ where: { id }, data: { status: 'CANCELLED' } })
  return NextResponse.json({ ok: true })
}
