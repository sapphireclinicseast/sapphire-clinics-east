import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { sendEmail } from '@/lib/email'

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

  if (!schedule) return NextResponse.json({ error: 'Session not found' }, { status: 404 })
  if (!schedule.sessionNote) return NextResponse.json({ error: 'No session note to send' }, { status: 400 })
  if (!schedule.patient?.email) return NextResponse.json({ error: 'Patient has no email address' }, { status: 400 })
  if (schedule.sessionNote.emailSentAt) return NextResponse.json({ error: 'Email already sent' }, { status: 400 })

  try {
    const patientName = `${schedule.patient.firstName} ${schedule.patient.lastName}`
    const therapistName = `${schedule.staff.firstName} ${schedule.staff.lastName}`
    const sessionDate = new Date(schedule.date).toLocaleDateString('en-US', {
      weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
    })

    const html = `
      <div style="font-family: 'Gill Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #1C2B30;">
        <div style="background: linear-gradient(135deg, #0D5B68, #1A7B8A); padding: 24px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px;">Teletherapy Session Notes</h1>
          <p style="color: rgba(255,255,255,0.7); margin: 4px 0 0; font-size: 14px;">Sapphire Clinics East, Inc.</p>
        </div>
        <div style="background: white; padding: 24px; border: 1px solid #E8EDEF; border-top: none; border-radius: 0 0 12px 12px;">
          <p>Dear <strong>${patientName}</strong>,</p>
          <p>Here are the notes from your teletherapy session:</p>
          <div style="background: #F7FAFB; padding: 16px; border-radius: 8px; margin-bottom: 16px;">
            <table style="width: 100%; font-size: 14px; border-collapse: collapse;">
              <tr><td style="padding: 4px 0; color: #9AABB0;">Date</td><td>${sessionDate}</td></tr>
              <tr><td style="padding: 4px 0; color: #9AABB0;">Time</td><td>${schedule.startTime} - ${schedule.endTime}</td></tr>
              <tr><td style="padding: 4px 0; color: #9AABB0;">Session Type</td><td>${schedule.sessionType}</td></tr>
              <tr><td style="padding: 4px 0; color: #9AABB0;">Clinician</td><td>${therapistName} (${schedule.staff.department})</td></tr>
            </table>
          </div>
          ${schedule.sessionNote.notes ? `
            <h3 style="font-size: 14px; color: #9AABB0;">Session Notes</h3>
            <div style="background: #F7FAFB; padding: 12px; border-radius: 8px; font-size: 14px; white-space: pre-wrap;">${schedule.sessionNote.notes}</div>
          ` : ''}
          <p style="font-size: 13px; color: #9AABB0; margin-top: 24px;">
            This is an automated message from SCEI Teletherapy. Please contact your clinician directly if you have questions.
          </p>
        </div>
      </div>
    `

    await sendEmail({
      to: schedule.patient.email,
      subject: `Teletherapy Session Notes - ${sessionDate}`,
      html,
    })

    await prisma.sessionNote.update({
      where: { id: schedule.sessionNote.id },
      data: { emailSentAt: new Date(), emailSentTo: schedule.patient.email },
    })

    return NextResponse.json({ success: true })
  } catch (err) {
    console.error('Email send error:', err)
    return NextResponse.json({ error: 'Failed to send email' }, { status: 500 })
  }
}
