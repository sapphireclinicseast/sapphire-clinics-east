// POST /api/decking/bookings/[id]/send-payment-email
// Re-sends the approval email (with payment link) for a booking.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendTransactionalEmail, renderApprovalEmail } from '@/lib/transactional-email'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const booking = await prisma.patientBooking.findUnique({
    where: { id },
    include: {
      patient: { select: { firstName: true, email: true } },
      payment: true,
    },
  })
  if (!booking) return NextResponse.json({ error: 'Booking not found' }, { status: 404 })
  if (!booking.patient.email)
    return NextResponse.json({ error: 'Patient has no email on file' }, { status: 400 })
  if (!booking.payment?.checkoutUrl)
    return NextResponse.json({ error: 'No payment link available' }, { status: 400 })

  const { subject, html } = renderApprovalEmail({
    firstName: booking.patient.firstName,
    branch: booking.branch,
    department: booking.department,
    date: booking.date.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC',
    }),
    startTime: booking.startTime,
    endTime: booking.endTime,
    downpaymentPhp: Number(booking.downpayment ?? 0),
    payUrl: booking.payment.checkoutUrl,
    meetLink: booking.meetLink,
  })

  await sendTransactionalEmail({ to: booking.patient.email, subject, html })
  return NextResponse.json({ sent: true })
}
