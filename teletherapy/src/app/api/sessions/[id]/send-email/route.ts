import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient, makeEmailBody } from '@/lib/email'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { id } = await params

  const schedule = await prisma.schedule.findUnique({
    where: { id },
    include: {
      patient: true,
      staff: true,
      sessionNote: true,
    },
  })

  if (!schedule) {
    return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  }

  if (!schedule.sessionNote) {
    return NextResponse.json({ error: 'No session note to send' }, { status: 400 })
  }

  if (!schedule.patient?.email) {
    return NextResponse.json({ error: 'Patient has no email address' }, { status: 400 })
  }

  if (schedule.sessionNote.emailSentAt) {
    return NextResponse.json({ error: 'Email already sent' }, { status: 400 })
  }

  try {
    const { gmail, senderEmail } = await getGmailClient()

    const patientName = `${schedule.patient.firstName} ${schedule.patient.lastName}`
    const therapistName = `${schedule.staff.firstName} ${schedule.staff.lastName}`
    const sessionDate = new Date(schedule.date).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })

    const subject = `Teletherapy Session Notes - ${sessionDate}`
    const htmlBody = `
      <div style="font-family: 'Gill Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1C2B30;">
        <div style="background: #1A7B8A; padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Teletherapy Session Notes</h1>
          <p style="color: rgba(255,255,255,0.8); margin: 4px 0 0; font-size: 14px;">Sapphire Clinics East, Inc.</p>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #E8EDEF; border-top: none; border-radius: 0 0 12px 12px;">
          <p style="margin: 0 0 16px;">Dear <strong>${patientName}</strong>,</p>
          <p style="margin: 0 0 16px;">Here are the notes from your teletherapy session:</p>

          <div style="background: #F7FAFB; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr><td style="padding: 4px 0; color: #9AABB0;">Date</td><td style="padding: 4px 0;">${sessionDate}</td></tr>
              <tr><td style="padding: 4px 0; color: #9AABB0;">Time</td><td style="padding: 4px 0;">${schedule.startTime} - ${schedule.endTime}</td></tr>
              <tr><td style="padding: 4px 0; color: #9AABB0;">Session Type</td><td style="padding: 4px 0;">${schedule.sessionType}</td></tr>
              <tr><td style="padding: 4px 0; color: #9AABB0;">Therapist</td><td style="padding: 4px 0;">${therapistName} (${schedule.staff.department})</td></tr>
              <tr><td style="padding: 4px 0; color: #9AABB0;">Status</td><td style="padding: 4px 0; color: #16a34a; font-weight: 600;">Completed</td></tr>
            </table>
          </div>

          ${schedule.sessionNote.notes ? `
          <div style="margin-bottom: 16px;">
            <h3 style="margin: 0 0 8px; font-size: 14px; color: #9AABB0;">Session Notes</h3>
            <div style="background: #F7FAFB; padding: 12px; border-radius: 8px; font-size: 14px; white-space: pre-wrap;">${schedule.sessionNote.notes}</div>
          </div>
          ` : ''}

          <p style="font-size: 13px; color: #9AABB0; margin: 24px 0 0;">
            This is an automated message from SCEI Teletherapy. If you have questions, please contact your therapist directly.
          </p>
        </div>
      </div>
    `

    const raw = makeEmailBody(schedule.patient.email, subject, htmlBody, senderEmail)
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

    await prisma.sessionNote.update({
      where: { id: schedule.sessionNote.id },
      data: {
        emailSentAt: new Date(),
        emailSentTo: schedule.patient.email,
      },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json(
      { error: 'Failed to send email. Check Gmail connection in Marketing Hub.' },
      { status: 500 }
    )
  }
}
