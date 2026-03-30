import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import nodemailer from 'nodemailer'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getPeriodLabel(cutoffPeriod: string) {
  const [year, month, half] = cutoffPeriod.split('-')
  return `${MONTHS[parseInt(month) - 1]} ${year} — ${half === '1' ? '1st Half (1–15)' : '2nd Half (16–End)'}`
}

function buildEmailHtml(firstName: string, periodLabel: string, netPay: string, branch: string) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Your Payslip — ${periodLabel}</title>
</head>
<body style="margin:0;padding:0;background:#fff8f3;font-family:'Helvetica Neue',Arial,sans-serif;">
  <div style="max-width:600px;margin:0 auto;background:#fff;">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#c44b00,#e8650a,#f4832a);padding:40px 40px 30px;text-align:center;">
      <img src="https://accounting.sapphireclinicseast.org/brand/sandbox-clinic-logo.png"
           alt="Sandbox Clinic" style="max-width:200px;height:auto;filter:brightness(0) invert(1);"
           onerror="this.style.display='none'">
      <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:14px 0 0;letter-spacing:2px;text-transform:uppercase;">
        ${branch || 'Sandbox Clinic'}
      </p>
    </div>

    <!-- Content -->
    <div style="padding:40px;">
      <h1 style="color:#c44b00;font-size:22px;margin:0 0 18px;font-weight:700;">
        Dear ${firstName},
      </h1>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 18px;">
        As another cutoff draws to a close, we want to take a moment to
        <strong style="color:#c44b00;">genuinely thank you</strong> for the incredible work you bring
        to Sandbox Clinic every single day.
      </p>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 18px;">
        Your dedication to each patient — the patience, the precision, the quiet compassion
        behind every session — does not go unnoticed. The progress our patients make is a direct
        reflection of the heart and skill you pour into your work. We are proud and grateful to
        have you on our team.
      </p>

      <!-- Net pay highlight -->
      <div style="background:#fff4ec;border:2px solid #f4832a;border-radius:14px;padding:24px;text-align:center;margin:28px 0;">
        <p style="margin:0 0 6px;font-size:12px;color:#c44b00;letter-spacing:2px;text-transform:uppercase;font-weight:600;">
          Your Net Pay for ${periodLabel}
        </p>
        <p style="margin:0;font-size:32px;font-weight:800;color:#c44b00;">${netPay}</p>
      </div>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 18px;">
        Your detailed payslip is <strong>attached to this email as a PDF</strong>.
        It contains a full breakdown of your earnings, any adjustments, and your final take-home pay
        for this cutoff. Please keep it for your records.
      </p>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 18px;">
        If you have any questions or concerns about your payslip, please don't hesitate to reach out
        to the clinic administration. We are always here to help.
      </p>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 4px;">
        With gratitude and appreciation,
      </p>
      <p style="color:#c44b00;font-weight:700;font-size:16px;margin:0 0 4px;">
        The Sandbox Clinic Administration Team
      </p>
      <p style="color:#888;font-size:13px;margin:0;">
        ${branch || 'Sandbox Clinic'}
      </p>
    </div>

    <!-- Divider -->
    <div style="height:1px;background:#ffdec8;margin:0 40px;"></div>

    <!-- Footer -->
    <div style="padding:24px 40px;text-align:center;">
      <p style="color:#bbb;font-size:11px;margin:0;line-height:1.7;">
        This email and its attachments are confidential and intended solely for the named recipient.<br>
        If you received this by mistake, please delete it immediately.
      </p>
    </div>

  </div>
</body>
</html>`
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return NextResponse.json(
      { error: 'Email is not configured. Please set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS in your environment.' },
      { status: 503 }
    )
  }

  try {
    const { consultantName, firstName, branch, cutoffPeriod, netPay, email, pdfBase64 } = await req.json()

    if (!email || !pdfBase64 || !cutoffPeriod) {
      return NextResponse.json({ error: 'email, pdfBase64, and cutoffPeriod are required' }, { status: 400 })
    }

    const periodLabel = getPeriodLabel(cutoffPeriod)
    const displayName = firstName || consultantName?.split(',')[1]?.trim() || consultantName || 'Clinician'

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT || '587'),
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    })

    const safeName = (consultantName || 'clinician').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    const pdfData = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64

    await transporter.sendMail({
      from: `"Sandbox Clinic" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
      to: email,
      subject: `Your Payslip — ${periodLabel} | Sandbox Clinic`,
      html: buildEmailHtml(displayName, periodLabel, netPay || '', branch || ''),
      attachments: [
        {
          filename: `payslip-${safeName}-${cutoffPeriod}.pdf`,
          content: pdfData,
          encoding: 'base64',
          contentType: 'application/pdf',
        },
      ],
    })

    return NextResponse.json({ sent: true, to: email })
  } catch (err) {
    console.error('Payslip email error:', err)
    return NextResponse.json({ error: String(err) || 'Failed to send email' }, { status: 500 })
  }
}
