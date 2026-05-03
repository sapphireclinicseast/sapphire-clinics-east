// GET  /api/public/bookings?token=...   — list a patient's own bookings
// POST /api/public/bookings              — create a new pending booking
//
// The patient may submit up to 3 slot choices (1 primary + 2 alternates).
// Front-desk then picks which of the 3 to approve.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../_cors'

interface ChoiceIn {
  staffId?: string
  date?: string // YYYY-MM-DD
  startTime?: string
  endTime?: string
}

export async function OPTIONS(req: NextRequest) {
  return preflight(req.headers.get('origin'))
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get('origin')
  const { searchParams } = new URL(req.url)
  const token = searchParams.get('token') ?? ''
  const session = verifyPatientToken(token)
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const bookings = await prisma.patientBooking.findMany({
    where: { patientId: session.patientId },
    orderBy: { date: 'desc' },
    take: 50,
    include: {
      staff: { select: { firstName: true, lastName: true, department: true } },
      payment: { select: { status: true, checkoutUrl: true, amount: true, paidAt: true } },
    },
  })

  const result = bookings.map((b) => ({
    id: b.id,
    status: b.status,
    branch: b.branch,
    department: b.department,
    date: b.date.toISOString().slice(0, 10),
    startTime: b.startTime,
    endTime: b.endTime,
    alternateChoices: (b.alternateChoices as unknown) ?? null,
    isTeletherapy: b.isTeletherapy,
    meetLink: b.status === 'PAID' ? b.meetLink : null,
    notes: b.notes,
    downpayment: b.downpayment ? Number(b.downpayment) : null,
    rejectionReason: b.rejectionReason,
    therapistInitials: `${b.staff.firstName?.[0] ?? '?'}${b.staff.lastName?.[0] ?? '?'}`.toUpperCase(),
    payment: b.payment
      ? {
          status: b.payment.status,
          checkoutUrl: b.payment.status === 'pending' ? b.payment.checkoutUrl : null,
          amount: Number(b.payment.amount),
          paidAt: b.payment.paidAt,
        }
      : null,
  }))

  return withCors(NextResponse.json({ bookings: result }), origin)
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get('origin')
  const body = (await req.json().catch(() => ({}))) as {
    token?: string
    branch?: string
    department?: string
    isTeletherapy?: boolean
    notes?: string
    choices?: ChoiceIn[]
  }

  const session = verifyPatientToken(body.token ?? '')
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  if (!body.branch || !body.department) {
    return withCors(
      NextResponse.json({ error: 'branch and department are required' }, { status: 400 }),
      origin,
    )
  }

  const choices = (body.choices ?? []).filter(
    (c): c is Required<ChoiceIn> =>
      !!c && !!c.staffId && !!c.date && !!c.startTime && !!c.endTime,
  )
  if (choices.length === 0) {
    return withCors(
      NextResponse.json({ error: 'At least one slot choice is required' }, { status: 400 }),
      origin,
    )
  }
  if (choices.length > 3) {
    return withCors(
      NextResponse.json({ error: 'At most 3 slot choices allowed' }, { status: 400 }),
      origin,
    )
  }

  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: { id: true },
  })
  if (!patient) {
    return withCors(NextResponse.json({ error: 'Patient not found' }, { status: 404 }), origin)
  }

  const primary = choices[0]
  const alternates = choices.slice(1).map((c) => ({
    staffId: c.staffId,
    date: c.date,
    startTime: c.startTime,
    endTime: c.endTime,
  }))
  const primaryDate = new Date(`${primary.date}T00:00:00.000Z`)

  // Prevent duplicate pending/approved bookings on the primary slot.
  const dup = await prisma.patientBooking.findFirst({
    where: {
      patientId: session.patientId,
      staffId: primary.staffId,
      date: primaryDate,
      startTime: primary.startTime,
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
    },
    select: { id: true },
  })
  if (dup) {
    return withCors(
      NextResponse.json(
        { error: 'You already have a booking for this slot' },
        { status: 409 },
      ),
      origin,
    )
  }

  const created = await prisma.patientBooking.create({
    data: {
      patientId: session.patientId,
      staffId: primary.staffId,
      branch: body.branch!,
      department: body.department!,
      date: primaryDate,
      startTime: primary.startTime,
      endTime: primary.endTime,
      isTeletherapy: !!body.isTeletherapy,
      notes: body.notes?.slice(0, 1000) ?? null,
      alternateChoices: alternates.length > 0 ? alternates : undefined,
      status: 'PENDING',
    },
    select: { id: true, status: true },
  })

  return withCors(NextResponse.json({ booking: created }), origin)
}
