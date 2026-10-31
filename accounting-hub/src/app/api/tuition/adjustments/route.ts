// POST   /api/tuition/adjustments — settle (part of) a tuition installment by
//        discount instead of cash. Body: { studentId, schoolYear, period, amount, reason }.
// DELETE /api/tuition/adjustments?id= — remove one.
//
// A discount counts toward its period in the dues and the semester running
// balance (lib/tuition-server studentBalances). It records no cash, no journal
// entry and nothing in Class Hub — the POS sale already booked what was paid.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'
import { CLASS_TO_LEDGER_BRANCH } from '@/lib/tuition'
import { TUITION_DISCOUNT_ROLES, fetchClassHub, studentBalances } from '@/lib/tuition-server'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { id?: string; name?: string | null; role?: string; branch?: string; branches?: string[] }
  if (!TUITION_DISCOUNT_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Only an admin or accountant can settle tuition by discount.' }, { status: 403 })

  const body = await req.json().catch(() => ({})) as { studentId?: string; schoolYear?: number; period?: string; amount?: number; reason?: string }
  const amount = Math.round(Number(body.amount) * 100) / 100
  const period = (body.period || '').trim()
  const reason = (body.reason || '').trim()
  const schoolYear = Number(body.schoolYear)
  if (!body.studentId || !period || !Number.isInteger(schoolYear)) return NextResponse.json({ error: 'Pick the student and the installment.' }, { status: 400 })
  if (!(amount > 0)) return NextResponse.json({ error: 'Enter the amount settled by the discount.' }, { status: 400 })
  if (!reason) return NextResponse.json({ error: 'Say why — e.g. the promo that covered it.' }, { status: 400 })

  let hub
  try { hub = await fetchClassHub({ schoolYear }) } catch {
    return NextResponse.json({ error: 'Could not reach Class Hub. Try again in a minute.' }, { status: 502 })
  }
  const student = hub.students.find(s => s.id === body.studentId)
  if (!student) return NextResponse.json({ error: 'That student is not enrolled in Class Hub.' }, { status: 404 })
  const branch = CLASS_TO_LEDGER_BRANCH[student.branch || '']
  if (!branch || !branchAllowed(user.branch, branch, user.branches)) {
    return NextResponse.json({ error: 'This student is outside your branch.' }, { status: 403 })
  }
  // Never more than is still owed for that installment (or one installment, for
  // a period not yet due).
  const bal = (await studentBalances({ classBranch: null, hub })).students.find(s => s.id === student.id)
  const due = bal?.dues.find(d => d.kind === 'REGULAR' && d.period === period)
    ?? (bal?.nextDue?.period === period ? bal.nextDue : null)
  const cap = due ? due.remaining : bal?.rate ?? null
  if (cap != null && amount > cap + 0.005) {
    return NextResponse.json({ error: `That is more than the ${cap.toFixed(2)} still owed for ${period}.` }, { status: 400 })
  }

  const row = await prisma.tuitionAdjustment.create({
    data: {
      studentId: student.id, studentName: student.name, schoolYear, period, amount, reason: reason.slice(0, 300),
      createdById: user.id as string, createdByName: user.name ?? null,
    },
  })
  return NextResponse.json({ id: row.id })
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = session.user as { role?: string }
  if (!TUITION_DISCOUNT_ROLES.includes(user.role ?? '')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id') || ''
  const row = await prisma.tuitionAdjustment.findUnique({ where: { id }, select: { id: true } })
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  await prisma.tuitionAdjustment.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
