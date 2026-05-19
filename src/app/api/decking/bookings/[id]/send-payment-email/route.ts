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
    date: booking.date.toDateString(),
    startTime: booking.startTime,
    endTime: booking.endTime,
    downpaymentPhp: Number(booking.downpayment ?? 0),
    payUrl: booking.payment.checkoutUrl,
    meetLink: booking.meetLink,
  })

  // Wrap the actual send so a Resend / SMTP failure returns a clean JSON error
  // instead of throwing — which would yield an empty response body and the
  // generic 'Failed to execute json on Response: Unexpected end of JSON input'
  // error in the UI. The original 401 from Resend (invalid API key) is the
  // canonical example we hit on 2026-05-18.
  try {
    await sendTransactionalEmail({ to: booking.patient.email, subject, html })
  } catch (err) {
    const msg = (err as Error).message ?? 'Unknown email-send failure'
    console.error('[decking send-payment-email] send failed:', msg)
    // Heuristic: surface the user-friendly cause for the most common case
    // (Resend rejecting the key) so the front-desk doesn't waste time
    // guessing.
    const userMsg = /401|403|API key|unauthorized/i.test(msg)
      ? 'Email service rejected the API key. Have an admin update RESEND_API_KEY in the server environment.'
      : 'Email service is unavailable right now. ' + msg
    return NextResponse.json({ error: userMsg, raw: msg }, { status: 502 })
  }
  return NextResponse.json({ sent: true })
}
