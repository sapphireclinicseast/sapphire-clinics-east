import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function getPeriodLabel(cutoffPeriod: string) {
  const [year, month, half] = cutoffPeriod.split('-')
  return `${MONTHS[parseInt(month) - 1]} ${year} — ${half === '1' ? '1st Half' : '2nd Half'}`
}

function buildEmailHtml(firstName: string, periodLabel: string, branch: string) {
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
      <p style="color:rgba(255,255,255,0.85);font-size:13px;margin:0;letter-spacing:2px;text-transform:uppercase;">
        ${branch || 'SCEI'}
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
        to SCEI every single day.
      </p>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 18px;">
        Your dedication to SCEI — the hard work, the attention to detail, and the
        commitment you bring every day — does not go unnoticed. The success of our clinic is a direct
        reflection of the effort and care you pour into your work. We are proud and grateful to
        have you on our team.
      </p>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 18px;">
        Your detailed payslip is <strong>attached to this email as a PDF</strong>.
        It contains a full breakdown of your earnings, any adjustments, and your final take-home pay
        for this cutoff. Please keep it for your records.
      </p>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 18px;">
        If you have any questions or concerns about your payslip, please don't hesitate to reach out
        to the clinic administration. We are always here to help.
      </p>

      <!-- Staff Payroll Revision Request -->
      <div style="background:#fff8f3;border:1px solid #ffdec8;border-radius:12px;padding:24px;margin:0 0 24px;text-align:center;">
        <p style="color:#c44b00;font-weight:700;font-size:14px;margin:0 0 8px;">
          Staff Payroll Revision Request
        </p>
        <p style="color:#3d2200;font-size:13px;line-height:1.6;margin:0 0 16px;">
          Need to request a revision to your payslip? Use the link or scan the QR code below.
        </p>
        <a href="https://hr.sapphireclinicseast.org/forms/fill/byKlxWS6"
           style="display:inline-block;background:#c44b00;color:#fff;font-size:13px;font-weight:600;padding:10px 24px;border-radius:8px;text-decoration:none;margin:0 0 16px;">
          Open Revision Request Form
        </a>
        <div style="margin:0 auto;">
          <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent('https://hr.sapphireclinicseast.org/forms/fill/byKlxWS6')}"
               alt="QR Code — Payroll Revision Request" width="140" height="140" style="display:block;margin:0 auto;" />
        </div>
      </div>

      <p style="color:#3d2200;line-height:1.8;font-size:15px;margin:0 0 4px;">
        With gratitude and appreciation,
      </p>
      <p style="color:#c44b00;font-weight:700;font-size:16px;margin:0 0 4px;">
        The SCEI Administration Team
      </p>
      <p style="color:#888;font-size:13px;margin:0;">
        ${branch || 'SCEI'}
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

  if (!process.env.RESEND_API_KEY) {
    return NextResponse.json(
      { error: 'Email is not configured. Please set RESEND_API_KEY in your environment.' },
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

    const safeName = (consultantName || 'clinician').replace(/[^a-zA-Z0-9]/g, '-').toLowerCase()
    const pdfData = pdfBase64.includes('base64,') ? pdfBase64.split('base64,')[1] : pdfBase64

    // Use Resend HTTP API (SMTP ports blocked on this VPS)
    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'SCEI Payroll <noreply@do-not-reply.sapphireclinicseast.org>',
        to: [email],
        subject: `Your Payslip — ${periodLabel} | SCEI`,
        html: buildEmailHtml(displayName, periodLabel, branch || ''),
        attachments: [
          {
            filename: `payslip-${safeName}-${cutoffPeriod}.pdf`,
            content: pdfData,
          },
        ],
      }),
    })

    if (!resendRes.ok) {
      const errData = await resendRes.json().catch(() => ({}))
      throw new Error(errData.message || `Resend API error (${resendRes.status})`)
    }

    return NextResponse.json({ sent: true, to: email })
  } catch (err) {
    console.error('Payslip email error:', err)
    return NextResponse.json({ error: String(err) || 'Failed to send email' }, { status: 500 })
  }
}
