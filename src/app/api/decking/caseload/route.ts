// Patients attached to a clinician with no day and no hour.
//
//   GET    /api/decking/caseload?branch=SBEA
//   POST   /api/decking/caseload        { staffId, patientId, … }
//   DELETE /api/decking/caseload        { id }
//
// An annulment evaluation runs over whatever sittings it needs, arranged
// between the psychologist and the family. The clinic still has to know whose
// case it is; the board has no hour to put it in. These entries say whose
// case, not when — dates are booked separately as one-offs, and the entry
// stays until the case closes.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWriteSlot, CROSS_BRANCH_DENIED } from '@/lib/decking-access'

export const dynamic = 'force-dynamic'

const PAYMENT_TYPES = ['CASH', 'HMO', 'GL'] as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branch = req.nextUrl.searchParams.get('branch')
  const rows = await prisma.deckingCaseload.findMany({
    where: { ...(branch ? { branch } : {}) },
    select: {
      id: true, staffId: true, branch: true, department: true,
      paymentType: true, hmoProvider: true, reason: true, createdAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
    orderBy: { createdAt: 'asc' },
  })
  return NextResponse.json(rows)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json().catch(() => ({}))
  const { staffId, patientId, branch, department, reason, hmoProvider, deliveryMode } = body
  if (!staffId || !patientId || !branch || !department) {
    return NextResponse.json(
      { error: 'staffId, patientId, branch and department are required' }, { status: 400 },
    )
  }

  // The same guard the slots themselves use, so a branch-scoped account cannot
  // put a patient on the other branch's board. Hiding a control is not a
  // permission.
  const role = (session.user as { role?: string })?.role ?? ''
  const mode = ['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(deliveryMode) ? deliveryMode : null
  if (!canWriteSlot(role, branch, mode)) {
    return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })
  }

  // Already on this clinician's list. Said plainly rather than refused with a
  // constraint error, because adding somebody twice is a slip, not an attack.
  const already = await prisma.deckingCaseload.findFirst({
    where: { staffId, patientId },
    select: { id: true, patient: { select: { firstName: true, lastName: true } } },
  })
  if (already) {
    return NextResponse.json(
      { error: `${already.patient.lastName}, ${already.patient.firstName} is already on this clinician's list.` },
      { status: 409 },
    )
  }

  const row = await prisma.deckingCaseload.create({
    data: {
      staffId, patientId, branch, department,
      // Whitelisted rather than passed through: this drives the colour coding
      // everywhere else, and an unrecognised value would read as plain cash.
      paymentType: PAYMENT_TYPES.includes(body.paymentType) ? body.paymentType : 'CASH',
      hmoProvider: hmoProvider || null,
      reason: (reason ?? '').toString().trim() || null,
    },
    select: {
      id: true, staffId: true, branch: true, department: true,
      paymentType: true, hmoProvider: true, reason: true, createdAt: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  return NextResponse.json(row)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await req.json().catch(() => ({}))
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const row = await prisma.deckingCaseload.findUnique({ where: { id }, select: { branch: true } })
  if (!row) return NextResponse.json({ ok: true })

  const role = (session.user as { role?: string })?.role ?? ''
  if (!canWriteSlot(role, row.branch, null)) {
    return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })
  }

  await prisma.deckingCaseload.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
