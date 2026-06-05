// Transactional email helper using the Resend HTTP API (port 443).
//
// Previously used nodemailer over SMTP (port 465) which the VPS was
// blocking outbound, causing ETIMEDOUT. HTTP API works over standard
// HTTPS and avoids the SMTP restriction.
//
// Docs: https://resend.com/docs/api-reference/emails/send-email

const FROM = 'Sapphire Clinics East <noreply@do-not-reply.sapphireclinicseast.org>'

export async function sendTransactionalEmail(params: {
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')

  const { to, subject, html, text } = params

  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + apiKey,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ''),
    }),
    signal: AbortSignal.timeout(10_000),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error('Resend API ' + res.status + ': ' + body.slice(0, 400))
  }
}

/** Template: appointment approved, here's your payment link. */
export function renderApprovalEmail(params: {
  firstName: string
  branch: string
  department: string
  date: string // already-formatted, e.g. "Mon, Apr 20 2026"
  startTime: string
  endTime: string
  downpaymentPhp: number
  payUrl: string
  meetLink?: string | null
}): { subject: string; html: string } {
  const branchName = params.branch === 'SBEA' ? 'East Branch' : 'Greenhills Branch'
  const subject = 'Your appointment is approved — please pay ₱' + params.downpaymentPhp.toLocaleString() + ' to confirm'
  const tele = params.meetLink
    ? '<p style="margin:16px 0 0"><strong>Teletherapy link (available after payment):</strong><br><a href="' + params.meetLink + '">' + params.meetLink + '</a></p>'
    : ''

  const html = `
  <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0f172a">
    <h2 style="color:#0f172a;margin:0 0 12px">Hi ${params.firstName},</h2>
    <p>Your appointment request has been <strong>approved</strong>. Please complete your downpayment to confirm the slot.</p>
    <div style="background:#f1f5f9;border-radius:12px;padding:16px;margin:16px 0">
      <div><strong>Branch:</strong> ${branchName}</div>
      <div><strong>Service:</strong> ${params.department}</div>
      <div><strong>Date:</strong> ${params.date}</div>
      <div><strong>Time:</strong> ${params.startTime} – ${params.endTime}</div>
      <div style="margin-top:8px"><strong>Downpayment:</strong> ₱${params.downpaymentPhp.toLocaleString()}</div>
    </div>
    <div style="text-align:center;margin:24px 0">
      <a href="${params.payUrl}" style="background:#f97316;color:#fff;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:600;display:inline-block">Pay Downpayment</a>
    </div>
    <p style="color:#64748b;font-size:13px">If the button doesn't work, open this link:<br>${params.payUrl}</p>
    ${tele}
    <p style="color:#94a3b8;font-size:12px;margin-top:32px">Sapphire Clinics East — sapphireclinicseast.org</p>
  </div>`

  return { subject, html }
}
