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

  const downpaymentPhp = getDownpayment(booking.branch, booking.department)

  // Generate Jitsi link if teletherapy (only now, so it's fresh per appointment)
  const meetLink = booking.isTeletherapy
    ? generateMeetLink(
        `${booking.staff.firstName} ${booking.staff.lastName}`,
        `${booking.patient.firstName} ${booking.patient.lastName}`,
        booking.date.toISOString().slice(0, 10),
      )
    : null

  // Create PayMongo link if there's a downpayment due and none exists yet
  let payment = booking.payment
  if (downpaymentPhp > 0 && !payment) {
    const link = await createPaymongoLink({
      amountPhp: downpaymentPhp,
      description: `Sapphire Clinics ${booking.branch} — ${booking.department} downpayment (${booking.date.toISOString().slice(0, 10)} ${booking.startTime})`,
      remarks: `Booking ${booking.id} — ${booking.patient.firstName} ${booking.patient.lastName}`,
    })
    payment = await prisma.patientPayment.create({
      data: {
        bookingId: booking.id,
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
        // Format the calendar date in UTC so the displayed day-of-week matches
        // what the patient picked on the portal (dates are stored as UTC midnight).
        date: activeBooking.date.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
        }),
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
