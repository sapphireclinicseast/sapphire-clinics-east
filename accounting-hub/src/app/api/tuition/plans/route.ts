// POST /api/tuition/plans — set the payment schedule for a Class Hub
// promissory note. Body: { studentId, promissoryNoteId, coveredDueDates (the
// installments the note covers), amount, notes?, items: [{ dueDate, amount }] }.
// The 3-month / same-semester rule is checked here (lib/tuition.ts →
// planProblem), not just on screen.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'
import { CLASS_TO_LEDGER_BRANCH, cleanCovered, cleanPlanItems, fromYmd, planAnchor, planProblem, semesterOf, toYmd, type PlanBody } from '@/lib/tuition'
import { TUITION_WRITE_ROLES, coveredElsewhere, fetchClassHub } from '@/lib/tuition-server'

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
  const covered = cleanCovered(body.coveredDueDates)
  const amount = Math.round(Number(body.amount) * 100) / 100
  const first = covered.length ? semesterOf(covered[0]) : null
  if (!first) return NextResponse.json({ error: planProblem({ coveredDueDates: covered, amount, items }) || 'Tick the months the note covers.' }, { status: 400 })

  let hub
  try { hub = await fetchClassHub({ schoolYear: first.schoolYear }) } catch {
    return NextResponse.json({ error: 'Could not reach Class Hub. Try again in a minute.' }, { status: 502 })
  }
  const student = hub.students.find(s => s.id === body.studentId)
  const note = hub.notes.find(n => n.id === body.promissoryNoteId && n.studentId === body.studentId)
  if (!student) return NextResponse.json({ error: 'That student is not enrolled in Class Hub.' }, { status: 404 })
  if (!note) return NextResponse.json({ error: 'That promissory note is not on this student in Class Hub.' }, { status: 404 })
  const noteDate = toYmd(note.createdAt)
  const problem = planProblem({ coveredDueDates: covered, noteDate, amount, items })
  if (problem) return NextResponse.json({ error: problem }, { status: 400 })
  const sem = semesterOf(planAnchor(covered, noteDate)!)!
  const clash = await coveredElsewhere(student.id, covered, null)
  if (clash) return NextResponse.json({ error: clash }, { status: 409 })
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
      originalDueDate: fromYmd(covered[0]), coveredDueDates: covered, amount, notes: body.notes?.trim() || null,
      createdById: user.id as string,
      items: { create: items.map((it, i) => ({ seq: i + 1, dueDate: fromYmd(it.dueDate), amount: it.amount })) },
    },
  })
  return NextResponse.json({ id: plan.id }, { status: 201 })
}
