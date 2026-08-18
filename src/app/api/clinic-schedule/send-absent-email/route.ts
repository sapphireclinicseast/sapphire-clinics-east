import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient } from '@/lib/email'
import { getBranchNotifyConfig, type BranchNotifyConfig } from '@/lib/branch-notify-config'

const LOGO_URL = 'https://operations.sapphireclinicseast.org/brand/aura-logo-cream.png'

function formatDate(dateStr: string): string {
  return new Date(dateStr + 'T12:00:00').toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
  })
}

function formatTime(t: string): string {
  const [h, m] = t.split(':').map(Number)
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`
}

function buildAbsentEmailHtml(opts: {
  patientName:        string
  clinicianFullName:  string
  date:               string
  startTime:          string
  endTime:            string
  sessionType:        string
  cfg:                BranchNotifyConfig
}): string {
  const cfg = opts.cfg
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
        <!-- Alert banner -->
        <tr>
          <td style="padding:16px 40px;background:#FEE2E2;border-bottom:2px solid #FECACA;text-align:center;">
            <p style="margin:0;font-weight:bold;font-size:15px;color:#991B1B;">⚠ Session Cancellation Notice</p>
          </td>
        </tr>
        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;">Dear ${opts.patientName},</p>
            <p style="margin:0 0 16px;">We regret to inform you that your scheduled session at Aura Health Rehab – ${cfg.branchName} has been <strong>cancelled</strong> due to your therapist, <strong>${opts.clinicianFullName}</strong>, being absent today.</p>
            <p style="margin:0 0 12px;">The cancelled session details are as follows:</p>
            <table cellpadding="0" cellspacing="0" style="margin:0 0 24px;width:100%;">
              <tr><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;width:180px;">Date:</td><td style="padding:6px 0;">${formatDate(opts.date)}</td></tr>
              <tr style="background:#f0f5e4;"><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">Time:</td><td style="padding:6px 0;">${formatTime(opts.startTime)} – ${formatTime(opts.endTime)}</td></tr>
              <tr><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">Type:</td><td style="padding:6px 0;">${opts.sessionType}</td></tr>
              <tr style="background:#f0f5e4;"><td style="padding:6px 12px 6px 0;font-weight:bold;white-space:nowrap;vertical-align:top;">Location:</td><td style="padding:6px 0;">${cfg.location}</td></tr>
            </table>
            <p style="margin:0 0 16px;">We sincerely apologize for the inconvenience this may cause. Our team will contact you as soon as possible to reschedule your appointment at a time that is most convenient for you.</p>
            <p style="margin:0 0 16px;">If you have any urgent concerns or would like to reach us directly, please don't hesitate to contact us:</p>
            <ul style="margin:0 0 24px;padding-left:20px;line-height:1.9;">
              <li>📞 Call or text: <strong>${phone1}</strong></li>
              <li>✉ Email: <a href="mailto:${cfg.ccEmail}" style="color:#4a8073;">${cfg.ccEmail}</a></li>
            </ul>
            <p style="margin:0 0 24px;">We value your time and trust, and we look forward to continuing your care. Thank you for your understanding and patience.</p>
            <p style="margin:0 0 4px;">With sincere apologies,</p>
            <p style="margin:0 0 2px;font-weight:bold;">${cfg.teamName}</p>
            <p style="margin:0 0 2px;">${cfg.phone}</p>
            <p style="margin:0 0 2px;"><a href="mailto:${cfg.ccEmail}" style="color:#4a8073;">${cfg.ccEmail}</a></p>
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

function buildAbsentEmailText(opts: {
  patientName:        string
  clinicianFullName:  string
  date:               string
  startTime:          string
  endTime:            string
  sessionType:        string
  cfg:                BranchNotifyConfig
}): string {
  const cfg = opts.cfg
  return [
    `Dear ${opts.patientName},`,
    '',
    `We regret to inform you that your scheduled session at Aura Health Rehab – ${cfg.branchName} has been CANCELLED due to your therapist, ${opts.clinicianFullName}, being absent today.`,
    '',
    'Cancelled session details:',
    `  Date:     ${formatDate(opts.date)}`,
    `  Time:     ${formatTime(opts.startTime)} – ${formatTime(opts.endTime)}`,
    `  Type:     ${opts.sessionType}`,
    `  Location: ${cfg.location}`,
    '',
    'We sincerely apologize for the inconvenience. Our team will contact you as soon as possible to reschedule at a time convenient for you.',
    '',
    'To reach us directly:',
    `  Call/text: ${cfg.phone.split('|')[0].trim()}`,
    `  Email:     ${cfg.ccEmail}`,
    '',
    'Thank you for your understanding and patience.',
    '',
    'With sincere apologies,',
    cfg.teamName,
    cfg.phone,
    cfg.ccEmail,
    'www.sapphireclinicseast.org',
  ].join('\n')
}

function makeRawEmail(opts: {
  to: string; cc: string; from: string; subject: string; html: string; text: string
}): string {
  const boundary = 'sa_boundary_' + Date.now()
  const message = [
    `From: Aura Health Rehab <${opts.from}>`,
    `To: ${opts.to}`,
    `Cc: ${opts.cc}`,
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
  to: string; subject: string; html: string; text: string; cc: string
}): Promise<void> {
  const gmailAcct = await prisma.gmailAccount.findFirst()
  if (gmailAcct) {
    const raw = makeRawEmail({
      to: opts.to, cc: opts.cc, from: gmailAcct.email,
      subject: opts.subject, html: opts.html, text: opts.text,
    })
    const gmail = await getGmailClient(gmailAcct.refreshToken)
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  }
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, date, branch: reqBranch } = await req.json()
  if (!staffId || !date) {
    return NextResponse.json({ error: 'Provide staffId and date' }, { status: 400 })
  }

  const dayStart = new Date(`${date}T00:00:00.000Z`)
  const dayEnd   = new Date(`${date}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: {
      staffId,
      date:    { gte: dayStart, lte: dayEnd },
      patient: { email: { not: null } },
    },
    include: { staff: true, patient: true },
    orderBy: { startTime: 'asc' },
  })

  if (schedules.length === 0) {
    return NextResponse.json(
      { error: 'No patients with email addresses scheduled for this day' },
      { status: 400 },
    )
  }

  const branch             = reqBranch || schedules[0].staff.branch
  const clinicianFullName  = `${schedules[0].staff.firstName} ${schedules[0].staff.lastName}`
  const cfg                = await getBranchNotifyConfig(branch)
  const subject             = `Important: Session Cancellation — Aura Health Rehab ${cfg.brandShort}`
  let sent = 0

  for (const s of schedules) {
    if (!s.patient?.email) continue
    try {
      await sendEmail({
        to:      s.patient.email,
        subject,
        html:    buildAbsentEmailHtml({
          patientName:       `${s.patient.firstName} ${s.patient.lastName}`,
          clinicianFullName,
          date,
          startTime:         s.startTime,
          endTime:           s.endTime,
          sessionType:       s.sessionType,
          cfg,
        }),
        text:    buildAbsentEmailText({
          patientName:       `${s.patient.firstName} ${s.patient.lastName}`,
          clinicianFullName,
          date,
          startTime:         s.startTime,
          endTime:           s.endTime,
          sessionType:       s.sessionType,
          cfg,
        }),
        cc: cfg.ccEmail,
      })
      sent++
    } catch (err) {
      console.error(`[send-absent-email] Failed for ${s.patient.email}:`, err)
    }
  }

  console.log(`[send-absent-email] sent=${sent} staffId=${staffId} date=${date}`)
  if (sent === 0) {
    return NextResponse.json({ error: 'Failed to send any emails' }, { status: 502 })
  }
  return NextResponse.json({ ok: true, sent })
}
