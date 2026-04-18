// GET  /api/public/bookings?token=...   — list a patient's own bookings
// POST /api/public/bookings              — create a new pending booking

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { preflight, withCors } from '../_cors'

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
    isTeletherapy: b.isTeletherapy,
    meetLink: b.status === 'PAID' ? b.meetLink : null, // only expose after payment
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
    staffId?: string
    branch?: string
    department?: string
    date?: string // "YYYY-MM-DD"
    startTime?: string
    endTime?: string
    isTeletherapy?: boolean
    notes?: string
    deckingSlotId?: string
  }
  const session = verifyPatientToken(body.token ?? '')
  if (!session) {
    return withCors(NextResponse.json({ error: 'Invalid token' }, { status: 401 }), origin)
  }

  const required = ['staffId', 'branch', 'department', 'date', 'startTime', 'endTime'] as const
  for (const k of required) {
    if (!body[k]) {
      return withCors(
        NextResponse.json({ error: `${k} is required` }, { status: 400 }),
        origin,
      )
    }
  }

  // Confirm patient exists.
  const patient = await prisma.patient.findUnique({
    where: { id: session.patientId },
    select: { id: true },
  })
  if (!patient) {
    return withCors(NextResponse.json({ error: 'Patient not found' }, { status: 404 }), origin)
  }

  // Prevent duplicate pending/approved bookings on the same slot.
  const date = new Date(`${body.date}T00:00:00.000Z`)
  const dup = await prisma.patientBooking.findFirst({
    where: {
      patientId: session.patientId,
      staffId: body.staffId,
      date,
      startTime: body.startTime,
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
    },
    select: { id: true },
  })
  if (dup) {
    return withCors(
      NextResponse.json({ error: 'You already have a booking for this slot' }, { status: 409 }),
      origin,
    )
  }

  const created = await prisma.patientBooking.create({
    data: {
      patientId: session.patientId,
      staffId: body.staffId!,
      branch: body.branch!,
      department: body.department!,
      date,
      startTime: body.startTime!,
      endTime: body.endTime!,
      isTeletherapy: !!body.isTeletherapy,
      notes: body.notes?.slice(0, 1000) ?? null,
      deckingSlotId: body.deckingSlotId ?? null,
      status: 'PENDING',
    },
    select: { id: true, status: true },
  })

  return withCors(NextResponse.json({ booking: created }), origin)
}
