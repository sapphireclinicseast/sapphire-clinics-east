// POST /api/decking/bookings/[id]/approve
// Marks a PatientBooking as APPROVED. Optional body { choiceIndex: 0|1|2 }
// lets the front desk pick the patient's 2nd or 3rd alternate instead of the
// primary slot. A race guard refuses to approve if another booking at the
// same (staff, date, time) has already been APPROVED/PAID/COMPLETED.

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
    const alts = (booking.alternateChoices as Array<{
      staffId: string
      date: string
      startTime: string
      endTime: string
    }> | null) ?? []
    const pick = alts[pickedIndex - 1]
    if (!pick) {
      return NextResponse.json({ error: `Alternate choice #${pickedIndex} not found` }, { status: 400 })
    }
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

  // Race guard: another booking may have been approved/paid for the same
  // (staff, date, time) while this one was pending. If so, refuse to approve.
  const conflict = await prisma.patientBooking.findFirst({
    where: {
      id: { not: activeBooking.id },
      staffId: activeBooking.staffId,
      date: activeBooking.date,
      startTime: activeBooking.startTime,
      status: { in: ['APPROVED', 'PAID', 'COMPLETED'] },
    },
    select: { status: true, patient: { select: { firstName: true, lastName: true } } },
  })
  if (conflict) {
    return NextResponse.json(
      {
        error: `This time slot has already been ${conflict.status.toLowerCase()} for ${conflict.patient.firstName} ${conflict.patient.lastName}. Pick a different slot or one of the alternates.`,
      },
      { status: 409 },
    )
  }

  const downpaymentPhp = getDownpayment(activeBooking.branch, activeBooking.department)

  const meetLink = activeBooking.isTeletherapy
    ? generateMeetLink(
        `${activeBooking.staff.firstName} ${activeBooking.staff.lastName}`,
        `${activeBooking.patient.firstName} ${activeBooking.patient.lastName}`,
        activeBooking.date.toISOString().slice(0, 10),
      )
    : null

  let payment = activeBooking.payment
  if (downpaymentPhp > 0 && !payment) {
    const link = await createPaymongoLink({
      amountPhp: downpaymentPhp,
      description: `Sapphire Clinics ${activeBooking.branch} — ${activeBooking.department} downpayment (${activeBooking.date.toISOString().slice(0, 10)} ${activeBooking.startTime})`,
      remarks: `Booking ${activeBooking.id} — ${activeBooking.patient.firstName} ${activeBooking.patient.lastName}`,
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

  if (activeBooking.patient.email && payment?.checkoutUrl) {
    try {
      const { subject, html } = renderApprovalEmail({
        firstName: activeBooking.patient.firstName,
        branch: activeBooking.branch,
        department: activeBooking.department,
        // Format in UTC so the weekday matches the stored UTC-midnight date.
        date: activeBooking.date.toLocaleDateString('en-US', {
          weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
        }),
        startTime: activeBooking.startTime,
        endTime: activeBooking.endTime,
        downpaymentPhp,
        payUrl: payment.checkoutUrl,
        meetLink,
      })
      await sendTransactionalEmail({ to: activeBooking.patient.email, subject, html })
    } catch (err) {
      console.error('Approval email failed:', err)
    }
  }

  return NextResponse.json({ booking: updated, payment })
}
