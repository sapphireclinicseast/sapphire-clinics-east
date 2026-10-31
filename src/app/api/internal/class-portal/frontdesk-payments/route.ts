// POST /api/internal/class-portal/frontdesk-payments
//
// Called by the accounting hub (shared EXTERNAL_API_KEY) when staff collect a
// scheduled promissory-note payment (AR → Tuition, or the POS reminder). Opens
// a PENDING front-desk payment row for the student, which the POS queue lists
// as a `clsp_` item; the cashier converts it like any other tuition item and
// the existing PATCH route flips it to CONVERTED. Idempotent on
// classPortalPaymentId.
//
// The plan is the student's latest recorded plan, so the fee summary's plan
// inference is unchanged by these rows.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const API_KEY = process.env.EXTERNAL_API_KEY || ''

export async function POST(req: NextRequest) {
  if (!API_KEY || req.headers.get('authorization') !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as {
    classPortalPaymentId?: string
    studentId?: string
    amountCentavos?: number
    period?: string
    notes?: string
  }
  const amountCentavos = Math.round(Number(body.amountCentavos ?? 0))
  if (!body.classPortalPaymentId || !body.studentId || !body.period || !(amountCentavos > 0)) {
    return NextResponse.json({ error: 'classPortalPaymentId, studentId, period and a positive amountCentavos are required.' }, { status: 400 })
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const student = await (prisma.classPortalUser as any).findUnique({
      where: { id: body.studentId },
      select: { id: true, role: true, email: true, firstName: true, lastName: true, branch: true },
    })
    if (!student || student.role !== 'STUDENT' || !student.branch) {
      return NextResponse.json({ error: 'Student not found.' }, { status: 404 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const latest = await (prisma.classPortalFrontDeskPayment as any).findFirst({
      where: { studentId: student.id, status: { not: 'VOIDED' } },
      orderBy: { createdAt: 'desc' },
      select: { plan: true },
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = await (prisma.classPortalFrontDeskPayment as any).upsert({
      where: { classPortalPaymentId: body.classPortalPaymentId },
      update: {},
      create: {
        classPortalPaymentId: body.classPortalPaymentId,
        studentId: student.id,
        studentEmail: student.email,
        studentName: [student.firstName, student.lastName].filter(Boolean).join(' ').trim() || student.email,
        branch: student.branch,
        plan: latest?.plan || 'ANNUAL',
        tuitionCentavos: amountCentavos,
        miscCentavos: 0,
        period: body.period,
        method: 'FRONT_DESK_CASH',
        methodDetail: 'CASH',
        notes: body.notes ?? null,
        isPartialPayment: true,
        status: 'PENDING',
      },
    })
    return NextResponse.json({
      payment: { classPortalPaymentId: row.classPortalPaymentId, status: row.status, amountCentavos: row.tuitionCentavos + row.miscCentavos },
    })
  } catch (e) {
    console.error('[internal/class-portal/frontdesk-payments] POST error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
