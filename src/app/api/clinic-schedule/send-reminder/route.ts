import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient } from '@/lib/email'
import { getBranchNotifyConfig, getBranchSender, branchCc, type BranchNotifyConfig } from '@/lib/branch-notify-config'

function subjectFor(cfg: BranchNotifyConfig): string {
  return `Appointment Confirmation - Aura Health Rehab ${cfg.brandShort}`
}

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${suffix}`
}

const LOGO_URL = 'https://operations.sapphireclinicseast.org/brand/aura-logo-cream.png'

function buildEmailHtml(opts: {
  patientName: string
  date: string
  startTime: string
  endTime: string
  sessionType: string
  cfg: BranchNotifyConfig
  meetLink?: string | null
}): string {
  const cfg = opts.cfg
  const ccEmail = cfg.ccEmail
  const phone1 = cfg.phone.split('|')[0].trim()

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#edf3d9;font-family:Arial,sans-serif;font-size:14px;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf3d9;padding:24px 0;">
    <tr><td>
      <table width="600" align="center" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.10);max-width:600px;">
        <!-- Header -->
        <tr>
          <td style="padding:28px 40px;text-align:center;background:linear-gradient(135deg,#193339 0%,#244952 65%,#4a8073 100%);">
            <img src="${LOGO_URL}" alt="Aura Health Rehab" style="height:140px;max-width:340px;display:inline-block;">
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;">Dear ${opts.patientName},</p>
            <p style="margin:0 0 16px;">Thank you for scheduling an appointment! At Aura Health Rehab, we are dedicated to providing you with the highest quality rehabilitation care to ensure the best possible outcomes.</p>
            <p style="margin:0 0 12px;">We are pleased to confirm your appointment as follows:</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
              <tr><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;width:180px;">Date:</td><td style="padding:6px 0;">${formatDate(opts.date)}</td></tr>
              <tr style="background:#f0f5e4;"><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">Time:</td><td style="padding:6px 0;">${formatTime(opts.startTime)} – ${formatTime(opts.endTime)}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">Location:</td><td style="padding:6px 0;">${cfg.location}</td></tr>
              <tr style="background:#f0f5e4;"><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">Type of Appointment:</td><td style="padding:6px 0;">${opts.sessionType}</td></tr>
${opts.meetLink ? `              <tr style="background:#EFF6FF;"><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">Teletherapy Link:</td><td style="padding:6px 0;"><a href="${opts.meetLink}" style="color:#244952;font-weight:bold;">Join Meeting</a></td></tr>` : ''}
            </table>
            <p style="margin:0 0 8px;font-weight:bold;">Important Information:</p>
            <ol style="margin:0 0 24px;padding-left:20px;line-height:1.7;">
              <li><strong>Arrival:</strong> Please arrive at least 10 minutes before your scheduled appointment to allow time for check-in and any necessary paperwork.</li>
              <li><strong>What to Bring:</strong> Kindly bring a valid ID, senior citizen or PWD ID (if applicable), and any relevant medical documents.</li>
              <li><strong>Cancellation/Rescheduling:</strong> Please inform us by <strong>5:00 PM the day before</strong> your appointment should you wish to cancel or reschedule. Your first 2 cancellations every 6 months are free (warning only); from the 3rd onward, a fee applies.
                <ul style="margin:6px 0 6px;padding-left:18px;line-height:1.8;">
                  <li>Inform the front desk <em>before</em> 5:00 PM the prior day — standard cancellation fee applies</li>
                  <li>Inform the front desk <em>after</em> 5:00 PM the prior day — late cancellation fee applies</li>
                  <li>No-show — fee charged from deposit</li>
                </ul>
                Please use official channels only: call ${phone1}, message us on Facebook, or email <a href="mailto:${ccEmail}" style="color:#4a8073;">${ccEmail}</a>, and confirm your message was acknowledged.
              </li>
            </ol>
            <p style="margin:0 0 8px;font-weight:bold;">Protocols:</p>
            <ol style="margin:0 0 24px;padding-left:20px;line-height:1.7;">
              <li>Masks are highly encouraged within the clinic premises.</li>
              <li>If you are experiencing any COVID-19 symptoms or feeling feverish, please reschedule your appointment.</li>
              <li>To maximize your consultation or session time, we recommend using the restroom or having a meal before your appointment.</li>
              <li>For children or those who need assistance, one guardian is allowed to stay in the clinic to avoid traffic in the hallways.</li>
              <li>Payment should be made before the start of the session.</li>
            </ol>
            <p style="margin:0 0 24px;">We look forward to providing you with exceptional care and service. If you have any questions or need further assistance, feel free to reach out to us.</p>
            <p style="margin:0 0 4px;">Best regards,</p>
            <p style="margin:0 0 2px;font-weight:bold;">${cfg.teamName}</p>
            <p style="margin:0 0 2px;">${cfg.phone}</p>
            <p style="margin:0 0 2px;"><a href="mailto:${ccEmail}" style="color:#4a8073;">${ccEmail}</a></p>
            <p style="margin:0;"><a href="https://www.sapphireclinicseast.org" style="color:#4a8073;">www.sapphireclinicseast.org</a></p>
          </td>
        </tr>
        <!-- Footer -->
        <tr>
          <td style="padding:16px 40px;background:#244952;border-top:1px solid #193339;text-align:center;font-size:12px;color:rgba(237,243,217,0.7);">
            This is an automated message. Please do not reply directly to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildEmailPlainText(opts: {
  patientName: string
  date: string
  startTime: string
  endTime: string
  sessionType: string
  cfg: BranchNotifyConfig
  meetLink?: string | null
}): string {
  const cfg = opts.cfg
  const ccEmail = cfg.ccEmail

  return [
    `Dear ${opts.patientName},`,
    '',
    'Thank you for scheduling an appointment! At Aura Health Rehab, we are dedicated to providing you with the highest quality rehabilitation care to ensure the best possible outcomes.',
    '',
    'We are pleased to confirm your appointment as follows:',
    '',
    `Date: ${formatDate(opts.date)}`,
    `Time: ${formatTime(opts.startTime)} – ${formatTime(opts.endTime)}`,
    `Location: ${cfg.location}`,
    `Type of Appointment: ${opts.sessionType}`,
    ...(opts.meetLink ? [`Teletherapy Link: ${opts.meetLink}`] : []),
    '',
    'Important Information:',
    '1. Arrival: Please arrive at least 10 minutes before your scheduled appointment to allow time for check-in and any necessary paperwork.',
    '2. What to Bring: Kindly bring a valid ID, senior citizen or PWD ID (if applicable), and any relevant medical documents.',
    `3. Cancellation/Rescheduling: Please inform us by 5:00 PM the day before your appointment should you wish to cancel or reschedule. Your first 2 cancellations every 6 months are free (warning only); from the 3rd onward, a fee applies.`,
    `   • Inform the front desk before 5:00 PM the prior day — standard cancellation fee applies`,
    `   • Inform the front desk after 5:00 PM the prior day — late cancellation fee applies`,
    `   • No-show — fee charged from deposit`,
    `   Please use official channels only: call ${cfg.phone.split('|')[0].trim()}, message us on Facebook, or email ${ccEmail}. Confirm your message was acknowledged.`,
    '',
    'Protocols:',
    '1. Masks are highly encouraged within the clinic premises.',
    '2. If you are experiencing any COVID-19 symptoms or feeling feverish, please reschedule your appointment.',
    '3. To maximize your consultation or session time, we recommend using the restroom or having a meal before your appointment.',
    '4. For children or those who need assistance, one guardian is allowed to stay in the clinic to avoid traffic in the hallways.',
    '5. Payment should be made before the start of the session.',
    '',
    'We look forward to providing you with exceptional care and service. If you have any questions or need further assistance, feel free to reach out to us.',
    '',
    'Best regards,',
    '',
    cfg.teamName,
    cfg.phone,
    ccEmail,
    'www.sapphireclinicseast.org',
  ].join('\n')
}

function makeRawEmail(opts: {
  to: string; cc: string; from: string; fromName: string; subject: string; html: string; text: string
}): string {
  const boundary = 'sb_boundary_' + Date.now()
  const message = [
    `From: ${opts.fromName} <${opts.from}>`,
    `To: ${opts.to}`,
    ...(opts.cc ? [`Cc: ${opts.cc}`] : []),
    `Subject: ${opts.subject}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    opts.html,
    '',
    `--${boundary}--`,
  ].join('\n')
  return Buffer.from(message).toString('base64url')
}

async function sendEmail(opts: {
  to: string; subject: string; html: string; text: string; cfg: BranchNotifyConfig
}): Promise<void> {
  // Sender is the branch's own mailbox (HR Platform → Branches → main email),
  // not whichever account happens to be first in the table — a Greenhills
  // appointment must not arrive from main@.
  const sender = await getBranchSender(opts.cfg)
  if (sender) {
    if (!sender.isBranchMailbox) {
      console.warn(
        `[send-reminder] ${opts.cfg.ccEmail} is not a connected Gmail account — ` +
        `sending as ${sender.email} instead. Connect it under Settings → Email.`,
      )
    }
    const raw = makeRawEmail({
      to: opts.to,
      cc: branchCc(opts.cfg, sender.email),
      from: sender.email,
      fromName: opts.cfg.brandName,
      subject: opts.subject,
      html: opts.html,
      text: opts.text,
    })
    const gmail = await getGmailClient(sender.refreshToken)
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { scheduleId, staffId, date, branch: reqBranch } = await req.json()

  // ── Single schedule reminder ──────────────────────────────────────────────
  if (scheduleId) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      include: { staff: true, patient: true },
    })

    if (!schedule) return NextResponse.json({ error: 'Schedule not found' }, { status: 404 })
    if (!schedule.patient?.email) {
      return NextResponse.json({ error: 'Patient has no email address on file' }, { status: 400 })
    }

    const dateStr = schedule.date.toISOString().split('T')[0]
    // Use scheduling branch (for interbranch consultants) if provided, else staff home branch
    const branch = reqBranch || schedule.staff.branch
    const cfg = await getBranchNotifyConfig(branch)
    const emailOpts = {
      patientName: `${schedule.patient.firstName} ${schedule.patient.lastName}`,
      date: dateStr,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      sessionType: schedule.sessionType,
      cfg,
      meetLink: (schedule as Record<string, unknown>).meetLink as string | null,
    }

    await sendEmail({
      to: schedule.patient.email,
      subject: subjectFor(cfg),
      html: buildEmailHtml(emailOpts),
      text: buildEmailPlainText(emailOpts),
      cfg,
    })
    console.log(`[send-reminder] Sent to ${schedule.patient.email}, CC: ${cfg.ccEmail}`)
    return NextResponse.json({ ok: true, sent: 1 })
  }

  // ── Bulk: all patients for a staff member on a given date ─────────────────
  if (staffId && date) {
    const dayStart = new Date(`${date}T00:00:00.000Z`)
    const dayEnd = new Date(`${date}T23:59:59.999Z`)

    const schedules = await prisma.schedule.findMany({
      where: {
        staffId,
        date: { gte: dayStart, lte: dayEnd },
        patient: { email: { not: null } },
      },
      include: { staff: true, patient: true },
      orderBy: { startTime: 'asc' },
    })

    if (schedules.length === 0) {
      return NextResponse.json({ error: 'No patients with email addresses scheduled for this day' }, { status: 400 })
    }

    let sent = 0
    for (const schedule of schedules) {
      if (!schedule.patient?.email) continue
      // Use scheduling branch (for interbranch consultants) if provided, else staff home branch
      const branch = reqBranch || schedule.staff.branch
      const cfg = await getBranchNotifyConfig(branch)
      const emailOpts = {
        patientName: `${schedule.patient.firstName} ${schedule.patient.lastName}`,
        date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        sessionType: schedule.sessionType,
        cfg,
        meetLink: (schedule as Record<string, unknown>).meetLink as string | null,
      }

      try {
        await sendEmail({
          to: schedule.patient.email,
          subject: subjectFor(cfg),
          html: buildEmailHtml(emailOpts),
          text: buildEmailPlainText(emailOpts),
          cfg,
        })
        sent++
      } catch (err) {
        console.error(`[send-reminder] Failed to send to ${schedule.patient.email}:`, err)
      }
    }

    console.log(`[send-reminder] Bulk sent ${sent} emails for staffId=${staffId} on ${date}`)
    return NextResponse.json({ ok: true, sent })
  }

  return NextResponse.json({ error: 'Provide scheduleId or staffId + date' }, { status: 400 })
}
