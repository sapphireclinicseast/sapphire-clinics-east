import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient } from '@/lib/email'

// ─── Branch config ────────────────────────────────────────────────────────────
const BRANCH_CONFIG: Record<string, { location: string; phone: string; teamName: string; ccEmail: string }> = {
  SBEA: {
    location: 'Sandbox Clinic - East',
    phone: '0917 118 9289 | (02) 5310 4991',
    teamName: 'Sandbox Clinic - East',
    ccEmail: 'east.sandboxclinic@gmail.com',
  },
  SBGH: {
    location: 'Sandbox Clinic Greenhills',
    phone: '0917 770 1686 | (02) 8529 1590',
    teamName: 'Sandbox Clinic Greenhills',
    ccEmail: 'greenhills.sandboxclinic@gmail.com',
  },
}

const LOGO_URL = 'https://operations.sapphireclinicseast.org/sandbox-clinic-logo.png'

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

function buildClinicianEmailHtml(opts: {
  firstName: string
  date: string
  branch: string
  schedules: {
    startTime: string
    endTime: string
    patientName: string
    sessionType: string
    isTeletherapy: boolean
    meetLink: string | null
  }[]
}): string {
  const cfg = BRANCH_CONFIG[opts.branch] ?? BRANCH_CONFIG['SBEA']
  const total = opts.schedules.length

  const rows = opts.schedules.map((s, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f9f9f9'
    const meetCell = s.isTeletherapy && s.meetLink
      ? `<a href="${s.meetLink}" style="color:#1D4ED8;font-weight:bold;font-size:12px;">Join Meet</a>`
      : s.isTeletherapy
        ? '<span style="color:#1D4ED8;font-size:12px;">Teletherapy</span>'
        : '<span style="color:#9CA3AF;font-size:12px;">In-Person</span>'
    return `<tr style="background:${bg};">
      <td style="padding:8px 12px;border-bottom:1px solid #eee;white-space:nowrap;">${formatTime(s.startTime)} - ${formatTime(s.endTime)}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:500;">${s.patientName}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;">${s.sessionType}</td>
      <td style="padding:8px 12px;border-bottom:1px solid #eee;text-align:center;">${meetCell}</td>
    </tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f9f9f9;font-family:Arial,sans-serif;font-size:14px;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f9f9f9;padding:24px 0;">
    <tr><td>
      <table width="640" align="center" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,0.08);max-width:640px;">
        <tr>
          <td style="padding:32px 40px 20px;text-align:center;border-bottom:1px solid #eeeeee;">
            <img src="${LOGO_URL}" alt="Sandbox Clinic" style="height:60px;max-width:280px;display:inline-block;">
          </td>
        </tr>
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 16px;">Hi ${opts.firstName}!</p>
            <p style="margin:0 0 16px;">Here is your schedule for <strong>${formatDate(opts.date)}</strong> at <strong>${cfg.teamName}</strong>:</p>

            <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #eee;border-radius:8px;overflow:hidden;margin:0 0 20px;">
              <thead>
                <tr style="background:#1A7B8A;color:#fff;">
                  <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;">Time</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;">Patient</th>
                  <th style="padding:10px 12px;text-align:left;font-size:12px;text-transform:uppercase;">Session</th>
                  <th style="padding:10px 12px;text-align:center;font-size:12px;text-transform:uppercase;">Mode</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>

            <p style="margin:0 0 24px;font-size:13px;color:#666;">
              Total patients: <strong>${total}</strong>
            </p>

            <p style="margin:0 0 4px;">Best regards,</p>
            <p style="margin:0;font-weight:bold;">${cfg.teamName} Team</p>
          </td>
        </tr>
        <tr>
          <td style="padding:16px 40px;background:#f5f5f5;border-top:1px solid #eeeeee;text-align:center;font-size:12px;color:#888;">
            This is an automated message. Please do not reply directly to this email.
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function buildClinicianEmailPlainText(opts: {
  firstName: string
  date: string
  branch: string
  schedules: {
    startTime: string
    endTime: string
    patientName: string
    sessionType: string
    isTeletherapy: boolean
    meetLink: string | null
  }[]
}): string {
  const cfg = BRANCH_CONFIG[opts.branch] ?? BRANCH_CONFIG['SBEA']
  const lines = [
    `Hi ${opts.firstName}!`,
    '',
    `Here is your schedule for ${formatDate(opts.date)} at ${cfg.teamName}:`,
    '',
  ]

  opts.schedules.forEach((s, i) => {
    const mode = s.isTeletherapy ? (s.meetLink ? `Teletherapy: ${s.meetLink}` : 'Teletherapy') : 'In-Person'
    lines.push(`${i + 1}. ${formatTime(s.startTime)} - ${formatTime(s.endTime)} | ${s.patientName} | ${s.sessionType} | ${mode}`)
  })

  lines.push('', `Total patients: ${opts.schedules.length}`, '', 'Best regards,', `${cfg.teamName} Team`)
  return lines.join('\n')
}

function makeRawEmail(opts: {
  to: string; from: string; subject: string; html: string; text: string
}): string {
  const boundary = 'sb_boundary_' + Date.now()
  const message = [
    `From: Sapphire Clinics East <${opts.from}>`,
    `To: ${opts.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(opts.subject).toString('base64')}?=`,
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

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, date } = await req.json()
  if (!staffId || !date) {
    return NextResponse.json({ error: 'staffId and date are required' }, { status: 400 })
  }

  // Get staff member
  const staffMember = await prisma.staff.findUnique({ where: { id: staffId } })
  if (!staffMember) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (!staffMember.email) return NextResponse.json({ error: 'Staff has no email address on file' }, { status: 400 })

  // Get schedules for this staff on this date
  const dayStart = new Date(`${date}T00:00:00.000Z`)
  const dayEnd = new Date(`${date}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where: { staffId, date: { gte: dayStart, lte: dayEnd } },
    include: { patient: true },
    orderBy: { startTime: 'asc' },
  })

  if (schedules.length === 0) {
    return NextResponse.json({ error: 'No schedules found for this staff on this date' }, { status: 400 })
  }

  const scheduleRows = schedules.map((s) => ({
    startTime: s.startTime,
    endTime: s.endTime,
    patientName: s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '(no patient)',
    sessionType: s.sessionType,
    isTeletherapy: (s as Record<string, unknown>).isTeletherapy as boolean || false,
    meetLink: ((s as Record<string, unknown>).meetLink as string) || null,
  }))

  const firstName = staffMember.firstName.charAt(0) + staffMember.firstName.slice(1).toLowerCase()
  const branch = staffMember.branch
  const cfg = BRANCH_CONFIG[branch] ?? BRANCH_CONFIG['SBEA']

  const emailOpts = { firstName, date, branch, schedules: scheduleRows }

  const html = buildClinicianEmailHtml(emailOpts)
  const text = buildClinicianEmailPlainText(emailOpts)
  const subject = `Your Schedule for ${formatDate(date)} - ${cfg.teamName}`

  // Send via Gmail API
  const gmailAcct = await prisma.gmailAccount.findFirst()
  if (!gmailAcct) {
    return NextResponse.json({ error: 'No Gmail account configured for sending' }, { status: 500 })
  }

  const raw = makeRawEmail({
    to: staffMember.email,
    from: gmailAcct.email,
    subject,
    html,
    text,
  })

  const gmail = await getGmailClient(gmailAcct.refreshToken)
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

  console.log(`[send-clinician-email] Sent schedule to ${staffMember.email} for ${date}`)
  return NextResponse.json({ ok: true, patients: schedules.length })
}
