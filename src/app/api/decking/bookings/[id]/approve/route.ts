// POST /api/decking/bookings/[id]/approve
// Marks a PatientBooking as APPROVED, computes downpayment, creates a PayMongo
// payment link, optionally generates a Jitsi meet link, and emails the patient
// a payment link.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getDownpayment } from '@/lib/downpayment'
import { createPaymongoLink } from '@/lib/paymongo'
import { generateMeetLink } from '@/lib/jitsi'
import { sendTransactionalEmail, renderApprovalEmail } from '@/lib/transactional-email'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const userId = (session.user as { id?: string } | undefined)?.id ?? null

  // Optional: { choiceIndex: 0 | 1 | 2 } — 0 = primary, 1/2 = alternates
  const body = (await req.json().catch(() => ({}))) as { choiceIndex?: number }
  const pickedIndex =
    typeof body.choiceIndex === 'number' && body.choiceIndex >= 0 && body.choiceIndex <= 2
      ? body.choiceIndex
      : 0

  const booking = await prisma.patientBooking.findUnique({
    where: { id },
    include: {
      patient: { select: { firstName: true, lastName: true, email: true } },
      staff: { select: { firstName: true, lastName: true } },
      payment: true,
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (booking.status !== 'PENDING') {
    return NextResponse.json(
      { error: `Booking is already ${booking.status}` },
      { status: 409 },
    )
  }

  // If the front desk picked an alternate, promote it to the primary slot.
  let activeBooking = booking
  if (pickedIndex > 0) {
    const alts = (activeBooking.alternateChoices as Array<{
      staffId: string
      date: string
      startTime: string
      endTime: string
    }> | null) ?? []
    const pick = alts[pickedIndex - 1]
    if (!pick) {
      return NextResponse.json({ error: `Alternate choice #${pickedIndex} not found` }, { status: 400 })
    }
    // Re-fetch staff for picked alternate (may differ from original primary staff).
    const pickedStaff = await prisma.staff.findUnique({
      where: { id: pick.staffId },
      select: { firstName: true, lastName: true },
    })
    activeBooking = await prisma.patientBooking.update({
      where: { id },
      data: {
        staffId: pick.staffId,
        date: new Date(`${pick.date}T00:00:00.000Z`),
        startTime: pick.startTime,
        endTime: pick.endTime,
      },
      include: {
        patient: { select: { firstName: true, lastName: true, email: true } },
        staff: { select: { firstName: true, lastName: true } },
        payment: true,
      },
    })
    if (pickedStaff) {
      activeBooking.staff = pickedStaff as typeof activeBooking.staff
    }
  }

  const downpaymentPhp = getDownpayment(activeBooking.branch, activeBooking.department)

  // Generate Jitsi link if teletherapy (only now, so it's fresh per appointment)
  const meetLink = activeBooking.isTeletherapy
    ? generateMeetLink(
        `${activeBooking.staff.firstName} ${activeBooking.staff.lastName}`,
        `${activeBooking.patient.firstName} ${activeBooking.patient.lastName}`,
        activeBooking.date.toISOString().slice(0, 10),
      )
    : null

  // Create PayMongo link if there's a downpayment due and none exists yet
  let payment = activeBooking.payment
  if (downpaymentPhp > 0 && !payment) {
    const link = await createPaymongoLink({
      amountPhp: downpaymentPhp,
      description: `Sapphire Clinics ${activeBooking.branch} — ${activeBooking.department} downpayment (${activeBooking.date.toISOString().slice(0, 10)} ${activeBooking.startTime})`,
      remarks: `Booking ${activeBooking.id} — ${activeBooking.patient.firstName} ${activeBooking.patient.lastName}`,
      branch: activeBooking.branch,
    })
    payment = await prisma.patientPayment.create({
      data: {
        bookingId: activeBooking.id,
        amount: downpaymentPhp,
        currency: 'PHP',
        paymongoLinkId: link.id,
        paymongoRef: link.referenceNumber,
        checkoutUrl: link.checkoutUrl,
        status: 'pending',
      },
    })
  }

  const updated = await prisma.patientBooking.update({
    where: { id },
    data: {
      status: 'APPROVED',
      downpayment: downpaymentPhp,
      approvedAt: new Date(),
      approvedBy: userId ?? undefined,
      meetLink,
    },
  })

  // Email the patient. Non-fatal on failure so the approve action still succeeds.
  if (activeBooking.patient.email && payment?.checkoutUrl) {
    try {
      const { subject, html } = renderApprovalEmail({
        firstName: activeBooking.patient.firstName,
        branch: activeBooking.branch,
        department: activeBooking.department,
        date: activeBooking.date.toDateString(),
        startTime: activeBooking.startTime,
        endTime: activeBooking.endTime,
        downpaymentPhp,
        payUrl: payment.checkoutUrl,
        meetLink,
      })
      await sendTransactionalEmail({
        to: activeBooking.patient.email,
        subject,
        html,
      })
    } catch (err) {
      console.error('Approval email failed:', err)
    }
  }

  return NextResponse.json({ booking: updated, payment })
}
