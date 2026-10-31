// POST /api/tuition/plans — set the payment schedule for a Class Hub
// promissory note. Body: { studentId, promissoryNoteId, originalDueDate,
// amount, notes?, items: [{ dueDate, amount }] }. The 3-month / same-semester
// rule is checked here (lib/tuition.ts → planProblem), not just on screen.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'
import { CLASS_TO_LEDGER_BRANCH, cleanPlanItems, fromYmd, planProblem, semesterOf, type PlanBody } from '@/lib/tuition'
import { TUITION_WRITE_ROLES, fetchClassHub } from '@/lib/tuition-server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { id?: string; role?: string; branch?: string; branches?: string[] }
  if (!TUITION_WRITE_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as PlanBody
  if (!body.studentId || !body.promissoryNoteId) {
    return NextResponse.json({ error: 'Pick the student and the promissory note this schedule is for.' }, { status: 400 })
  }
  const items = cleanPlanItems(body.items)
  const amount = Math.round(Number(body.amount) * 100) / 100
  const problem = planProblem({ originalDueDate: body.originalDueDate || '', amount, items })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const sem = semesterOf(body.originalDueDate!)!

  let hub
  try { hub = await fetchClassHub({ schoolYear: sem.schoolYear }) } catch {
    return NextResponse.json({ error: 'Could not reach Class Hub. Try again in a minute.' }, { status: 502 })
  }
  const student = hub.students.find(s => s.id === body.studentId)
  const note = hub.notes.find(n => n.id === body.promissoryNoteId && n.studentId === body.studentId)
  if (!student) return NextResponse.json({ error: 'That student is not enrolled in Class Hub.' }, { status: 404 })
  if (!note) return NextResponse.json({ error: 'That promissory note is not on this student in Class Hub.' }, { status: 404 })
  const branch = CLASS_TO_LEDGER_BRANCH[student.branch || '']
  if (!branch || !branchAllowed(user.branch, branch, user.branches)) {
    return NextResponse.json({ error: 'This student is outside your branch.' }, { status: 403 })
  }
  const taken = await prisma.tuitionPaymentPlan.findFirst({ where: { promissoryNoteId: note.id, status: 'ACTIVE' }, select: { id: true } })
  if (taken) return NextResponse.json({ error: 'This promissory note already has a payment plan. Edit that one instead.' }, { status: 409 })

  const plan = await prisma.tuitionPaymentPlan.create({
    data: {
      studentId: student.id, studentName: student.name, studentEmail: student.email, patientId: student.patientId,
      branch, promissoryNoteId: note.id, schoolYear: sem.schoolYear, semester: sem.semester,
      originalDueDate: fromYmd(body.originalDueDate!), amount, notes: body.notes?.trim() || null,
      createdById: user.id as string,
      items: { create: items.map((it, i) => ({ seq: i + 1, dueDate: fromYmd(it.dueDate), amount: it.amount })) },
    },
  })
  return NextResponse.json({ id: plan.id }, { status: 201 })
}
