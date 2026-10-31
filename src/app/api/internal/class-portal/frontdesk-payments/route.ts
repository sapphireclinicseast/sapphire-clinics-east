// POST /api/internal/class-portal/frontdesk-payments
//
// Called by the accounting hub (shared EXTERNAL_API_KEY) when a tuition sale is
// completed at the POS. Tuition is recorded only there (Hannah, 2026-10-31):
// Class Hub just shows what the POS recorded, so this creates the student's
// payment row already PAID (CONVERTED) and tells the family it was received.
// Idempotent on classPortalPaymentId. The [classPortalPaymentId] PATCH route
// keeps it in step when the sale is voided, reopened or edited.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/class-portal-notifications'

const API_KEY = process.env.EXTERNAL_API_KEY || ''
const METHODS = ['PAYMONGO', 'BANK_DEPOSIT', 'FRONT_DESK_CASH']
const DETAILS = ['CASH', 'CREDIT_CARD', 'DEBIT_CARD', 'GCASH', 'PAYMAYA']

export async function POST(req: NextRequest) {
  if (!API_KEY || req.headers.get('authorization') !== `Bearer ${API_KEY}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const body = await req.json().catch(() => ({})) as {
    classPortalPaymentId?: string
    studentId?: string
    plan?: string
    period?: string
    amountCentavos?: number
    isPartialPayment?: boolean
    method?: string
    methodDetail?: string | null
    notes?: string
    paidAt?: string
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
    const method = METHODS.includes(body.method || '') ? body.method : 'FRONT_DESK_CASH'
    const methodDetail = method === 'FRONT_DESK_CASH' ? (DETAILS.includes(body.methodDetail || '') ? body.methodDetail : 'CASH') : null
    const paidAt = body.paidAt && Number.isFinite(new Date(body.paidAt).getTime()) ? new Date(body.paidAt) : new Date()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const existing = await (prisma.classPortalFrontDeskPayment as any).findUnique({ where: { classPortalPaymentId: body.classPortalPaymentId } })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const row = existing ?? await (prisma.classPortalFrontDeskPayment as any).create({
      data: {
        classPortalPaymentId: body.classPortalPaymentId,
        studentId: student.id,
        studentEmail: student.email,
        studentName: [student.firstName, student.lastName].filter(Boolean).join(' ').trim() || student.email,
        branch: student.branch,
        plan: body.plan || latest?.plan || 'ANNUAL',
        tuitionCentavos: amountCentavos,
        miscCentavos: 0,
        period: body.period,
        method,
        methodDetail,
        notes: body.notes ?? null,
        isPartialPayment: Boolean(body.isPartialPayment),
        status: 'CONVERTED',
        createdAt: paidAt,
        convertedAt: paidAt,
      },
    })
    if (!existing) {
      const amount = `₱${(amountCentavos / 100).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
      await createNotification({
        userId: student.id,
        kind: 'PAYMENT_RECEIVED',
        title: `Payment received · ${row.period}`,
        body: `${amount} received${row.isPartialPayment ? ' (partial payment)' : ''}. Thank you!`,
        href: '/profile',
        payload: { frontDeskPaymentId: row.id, classPortalPaymentId: row.classPortalPaymentId },
      }).catch(() => {})
    }
    return NextResponse.json({
      payment: { classPortalPaymentId: row.classPortalPaymentId, status: row.status, amountCentavos: row.tuitionCentavos + row.miscCentavos },
    })
  } catch (e) {
    console.error('[internal/class-portal/frontdesk-payments] POST error:', e)
    return NextResponse.json({ error: 'Server error' }, { status: 500 })
  }
}
