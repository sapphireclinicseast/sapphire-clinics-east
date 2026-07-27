// GET  /api/public/bookings?token=...   — list a patient's own bookings
// POST /api/public/bookings              — create a booking and immediately
//                                          generate the PayMongo checkout URL.
//
// New flow (2026-05-18, self-service): no front-desk approval gate. The
// patient picks slot(s), submits, and is bounced to PayMongo. Once paid,
// the PayMongo webhook flips status PENDING → PAID and the booking
// surfaces in the Decking Module's "Paid Downpayment" section, where the
// front desk just runs two follow-ups (Add to Staff Deck, Recorded in
// Accounting Hub).
//
// PENDING bookings DO NOT lock the slot — multiple patients can submit
// for the same time slot. Whoever pays first wins. Subsequent PayMongo
// attempts on a now-locked slot will go through and need refunding.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyPatientToken } from '@/lib/patient-session'
import { getDownpayment } from '@/lib/downpayment'
import { createPaymongoLink } from '@/lib/paymongo'
import { generateMeetLink } from '@/lib/jitsi'
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

  const result = bookings
    // Exclude PENDING teletherapy bookings from the patient's session view —
    // they have no date/staff yet and aren't actionable by the patient.
    .filter((b) => !(b.isTeletherapy && b.status === 'PENDING' && !b.date))
    .map((b) => ({
    id: b.id,
    status: b.status,
    branch: b.branch,
    department: b.department,
    date: b.date ? b.date.toISOString().slice(0, 10) : '',
    startTime: b.startTime,
    endTime: b.endTime,
    alternateChoices: (b.alternateChoices as unknown) ?? null,
    isTeletherapy: b.isTeletherapy,
    meetLink: b.status === 'PAID' ? b.meetLink : null,
    notes: b.notes,
    downpayment: b.downpayment ? Number(b.downpayment) : null,
    rejectionReason: b.rejectionReason,
    therapistInitials: b.staff
      ? `${b.staff.firstName?.[0] ?? '?'}${b.staff.lastName?.[0] ?? '?'}`.toUpperCase()
      : '--',
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
    select: { id: true, firstName: true, lastName: true },
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

  // Lock check: if anyone has already PAID for this exact slot, refuse early.
  // (PENDING bookings deliberately don't lock — first to pay wins.)
  const locked = await prisma.patientBooking.findFirst({
    where: {
      staffId: primary.staffId,
      date: primaryDate,
      startTime: primary.startTime,
      status: { in: ['PAID', 'COMPLETED'] },
    },
    select: { id: true },
  })
  if (locked) {
    return withCors(
      NextResponse.json(
        { error: 'This slot is no longer available — another patient just paid for it. Please pick a different time.' },
        { status: 409 },
      ),
      origin,
    )
  }

  // Prevent the same patient from creating duplicate bookings on this slot.
  const dup = await prisma.patientBooking.findFirst({
    where: {
      patientId: session.patientId,
      staffId: primary.staffId,
      date: primaryDate,
      startTime: primary.startTime,
      status: { in: ['PENDING', 'APPROVED', 'PAID'] },
    },
    select: { id: true, payment: { select: { checkoutUrl: true, status: true } } },
  })
  if (dup) {
    // If the previous attempt has a still-pending PayMongo link, return it so
    // the patient can finish that flow instead of accidentally double-paying.
    return withCors(
      NextResponse.json({
        error: 'You already have a booking for this slot.',
        bookingId: dup.id,
        checkoutUrl: dup.payment?.status === 'pending' ? dup.payment.checkoutUrl : null,
      }, { status: 409 }),
      origin,
    )
  }

  // Look up staff name (for PayMongo description + Jitsi room).
  const staff = await prisma.staff.findUnique({
    where: { id: primary.staffId },
    select: { firstName: true, lastName: true },
  })

  const downpaymentPhp = getDownpayment(body.branch!, body.department!)

  // Generate the teletherapy link now so we don't have to come back later.
  const meetLink = body.isTeletherapy
    ? generateMeetLink(
        `${staff?.firstName ?? ''} ${staff?.lastName ?? ''}`.trim() || 'Therapist',
        `${patient.firstName} ${patient.lastName}`,
        primary.date,
      )
    : null

  // Create the booking first so we have an ID to embed in the PayMongo
  // description / remarks. Status stays PENDING until the webhook flips it.
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
      meetLink,
      notes: body.notes?.slice(0, 1000) ?? null,
      alternateChoices: alternates.length > 0 ? alternates : undefined,
      downpayment: downpaymentPhp,
      status: 'PENDING',
    },
    select: { id: true, status: true },
  })

  // Generate PayMongo Link (skip when downpayment is ₱0 — booking still
  // counts as confirmed; webhook is a no-op).
  let checkoutUrl: string | null = null
  if (downpaymentPhp > 0) {
    try {
      const link = await createPaymongoLink({
        amountPhp: downpaymentPhp,
        description: `Sapphire Clinics ${body.branch} — ${body.department} downpayment (${primary.date} ${primary.startTime})`,
        remarks: `Booking ${created.id} — ${patient.firstName} ${patient.lastName}`,
        branch: body.branch,
      })
      await prisma.patientPayment.create({
        data: {
          bookingId: created.id,
          amount: downpaymentPhp,
          currency: 'PHP',
          paymongoLinkId: link.id,
          paymongoRef: link.referenceNumber,
          checkoutUrl: link.checkoutUrl,
          status: 'pending',
        },
      })
      checkoutUrl = link.checkoutUrl
    } catch (err) {
      console.error('[bookings POST] PayMongo link creation failed:', err)
      // Roll back the booking so the patient doesn't see a stuck PENDING
      // row with no payment URL.
      await prisma.patientBooking.delete({ where: { id: created.id } }).catch(() => {})
      return withCors(
        NextResponse.json(
          { error: 'Payment service is unavailable right now. Please try again in a few moments.' },
          { status: 502 },
        ),
        origin,
      )
    }
  } else {
    // Zero-downpayment service (e.g. Orthosis at SBEA): confirm immediately.
    await prisma.patientBooking.update({
      where: { id: created.id },
      data: { status: 'PAID', paidAt: new Date() },
    })
  }

  return withCors(
    NextResponse.json({ booking: created, checkoutUrl }),
    origin,
  )
}
