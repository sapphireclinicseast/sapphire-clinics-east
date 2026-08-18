import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient } from '@/lib/email'
import { getBranchNotifyConfig, type BranchNotifyConfig } from '@/lib/branch-notify-config'

// This file wants the SHORT display forms — "Aura Health Rehab – East" as
// the team label, "Aura Health Rehab – East Branch" as the location line —
// unlike send-absent-email/send-reminder, which want the full street
// address. Derive both from the shared config's raw brandName.
function shortLocation(cfg: BranchNotifyConfig): string {
  return `${cfg.brandName} Branch`
}

const LOGO_URL = 'https://operations.sapphireclinicseast.org/brand/aura-logo-cream.png'

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
  cfg: BranchNotifyConfig
  schedules: {
    startTime: string
    endTime: string
    patientName: string
    sessionType: string
    isTeletherapy: boolean
    meetLink: string | null
  }[]
}): string {
  const cfg = opts.cfg
  const total = opts.schedules.length

  const rows = opts.schedules.map((s, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : '#f0f5e4'
    const meetCell = s.isTeletherapy && s.meetLink
      ? `<a href="${s.meetLink}" style="color:#4a8073;font-weight:bold;font-size:12px;">Join Meet</a>`
      : s.isTeletherapy
        ? '<span style="color:#4a8073;font-size:12px;">Teletherapy</span>'
        : '<span style="color:#9CA3AF;font-size:12px;">In-Person</span>'
    return `<tr style="background:${bg};">
      <td style="padding:9px 14px;border-bottom:1px solid #e8eee0;white-space:nowrap;font-size:13px;">${formatTime(s.startTime)} – ${formatTime(s.endTime)}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e8eee0;font-weight:600;font-size:13px;">${s.patientName}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e8eee0;font-size:13px;">${s.sessionType}</td>
      <td style="padding:9px 14px;border-bottom:1px solid #e8eee0;text-align:center;">${meetCell}</td>
    </tr>`
  }).join('\n')

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#edf3d9;font-family:Arial,sans-serif;font-size:14px;color:#333;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf3d9;padding:24px 0;">
    <tr><td>
      <table width="640" align="center" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.10);max-width:640px;">

        <!-- Header -->
        <tr>
          <td style="padding:32px 40px 28px;text-align:center;background:linear-gradient(135deg,#193339 0%,#244952 65%,#4a8073 100%);">
            <img src="${LOGO_URL}" alt="Aura Health Rehab" style="height:120px;max-width:300px;display:inline-block;">
            <p style="margin:14px 0 0;font-size:13px;letter-spacing:0.08em;color:rgba(237,243,217,0.80);text-transform:uppercase;">${cfg.brandName}</p>
          </td>
        </tr>

        <!-- Schedule banner -->
        <tr>
          <td style="padding:12px 40px;background:#cf9d88;text-align:center;">
            <p style="margin:0;font-size:13px;font-weight:bold;color:#fff;letter-spacing:0.05em;text-transform:uppercase;">
              Your Schedule for ${formatDate(opts.date)}
            </p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 40px;">
            <p style="margin:0 0 18px;font-size:15px;">Hi <strong>${opts.firstName}</strong>!</p>
            <p style="margin:0 0 20px;color:#444;">
              Here is your confirmed schedule at <strong>${shortLocation(cfg)}</strong>:
            </p>

            <!-- Schedule table -->
            <table cellpadding="0" cellspacing="0" style="width:100%;border:1px solid #d6e4d0;border-radius:8px;overflow:hidden;margin:0 0 24px;">
              <thead>
                <tr style="background:#244952;">
                  <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#edf3d9;">Time</th>
                  <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#edf3d9;">Patient</th>
                  <th style="padding:10px 14px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#edf3d9;">Session</th>
                  <th style="padding:10px 14px;text-align:center;font-size:11px;text-transform:uppercase;letter-spacing:0.08em;color:#edf3d9;">Mode</th>
                </tr>
              </thead>
              <tbody>
                ${rows}
              </tbody>
            </table>

            <p style="margin:0 0 28px;font-size:13px;color:#666;">
              Total confirmed patients: <strong style="color:#244952;">${total}</strong>
            </p>

            <p style="margin:0 0 4px;color:#555;">Warm regards,</p>
            <p style="margin:0 0 2px;font-weight:bold;color:#244952;">${cfg.brandName} Team</p>
            <p style="margin:0 0 2px;font-size:13px;color:#777;">${cfg.phone}</p>
            <p style="margin:0;font-size:13px;">
              <a href="mailto:${cfg.ccEmail}" style="color:#4a8073;">${cfg.ccEmail}</a>
            </p>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="padding:16px 40px;background:#244952;border-top:1px solid #193339;text-align:center;font-size:12px;color:rgba(237,243,217,0.65);">
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
  cfg: BranchNotifyConfig
  schedules: {
    startTime: string
    endTime: string
    patientName: string
    sessionType: string
    isTeletherapy: boolean
    meetLink: string | null
  }[]
}): string {
  const cfg = opts.cfg
  const lines = [
    `Hi ${opts.firstName}!`,
    '',
    `Here is your schedule for ${formatDate(opts.date)} at ${shortLocation(cfg)}:`,
    '',
  ]

  opts.schedules.forEach((s, i) => {
    const mode = s.isTeletherapy ? (s.meetLink ? `Teletherapy: ${s.meetLink}` : 'Teletherapy') : 'In-Person'
    lines.push(`${i + 1}. ${formatTime(s.startTime)} – ${formatTime(s.endTime)} | ${s.patientName} | ${s.sessionType} | ${mode}`)
  })

  lines.push(
    '',
    `Total confirmed patients: ${opts.schedules.length}`,
    '',
    'Warm regards,',
    `${cfg.brandName} Team`,
    cfg.phone,
    cfg.ccEmail,
  )
  return lines.join('\n')
}

function makeRawEmail(opts: {
  to: string; from: string; subject: string; html: string; text: string
}): string {
  const boundary = 'ah_boundary_' + Date.now()
  const message = [
    `From: Aura Health Rehab <${opts.from}>`,
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

  const { staffId, date, branch: callerBranch } = await req.json()
  if (!staffId || !date) {
    return NextResponse.json({ error: 'staffId and date are required' }, { status: 400 })
  }

  const staffMember = await prisma.staff.findUnique({ where: { id: staffId } })
  if (!staffMember) return NextResponse.json({ error: 'Staff not found' }, { status: 404 })
  if (!staffMember.email) return NextResponse.json({ error: 'Staff has no email address on file' }, { status: 400 })

  const dayStart = new Date(`${date}T00:00:00.000Z`)
  const dayEnd   = new Date(`${date}T23:59:59.999Z`)

  const schedules = await prisma.schedule.findMany({
    where:   { staffId, date: { gte: dayStart, lte: dayEnd } },
    include: { patient: true },
    orderBy: { startTime: 'asc' },
  })

  if (schedules.length === 0) {
    return NextResponse.json({ error: 'No schedules found for this staff on this date' }, { status: 400 })
  }

  const scheduleRows = schedules.map((s) => ({
    startTime:     s.startTime,
    endTime:       s.endTime,
    patientName:   s.patient ? `${s.patient.lastName}, ${s.patient.firstName}` : '(no patient)',
    sessionType:   s.sessionType,
    isTeletherapy: (s as Record<string, unknown>).isTeletherapy as boolean || false,
    meetLink:      ((s as Record<string, unknown>).meetLink as string) || null,
  }))

  const firstName = staffMember.firstName.charAt(0) + staffMember.firstName.slice(1).toLowerCase()
  const branch    = callerBranch ?? staffMember.branch
  const cfg       = await getBranchNotifyConfig(branch)
  const emailOpts = { firstName, date, cfg, schedules: scheduleRows }

  const html    = buildClinicianEmailHtml(emailOpts)
  const text    = buildClinicianEmailPlainText(emailOpts)
  const subject = `Your Schedule for ${formatDate(date)} – ${cfg.brandName}`

  // Prefer the branch inbox; fall back to any connected Gmail account
  const gmailAcct =
    await prisma.gmailAccount.findUnique({ where: { email: cfg.ccEmail } }) ??
    await prisma.gmailAccount.findFirst()
  if (!gmailAcct) {
    return NextResponse.json({ error: 'No Gmail account configured for sending' }, { status: 500 })
  }

  const raw = makeRawEmail({ to: staffMember.email, from: gmailAcct.email, subject, html, text })
  const gmail = await getGmailClient(gmailAcct.refreshToken)
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })

  console.log(`[send-clinician-email] Sent schedule to ${staffMember.email} for ${date}`)
  return NextResponse.json({ ok: true, patients: schedules.length })
}
