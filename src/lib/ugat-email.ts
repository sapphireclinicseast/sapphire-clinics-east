// UGAT Fellowship transactional email — verification link.
// Uses the Resend HTTP API (port 443) like src/lib/transactional-email.ts;
// the VPS blocks outbound SMTP so HTTP is the only reliable path.
//
// Sender: scholarship@sapphireclinicseast.org. This address must be an
// authorized sender on a Resend-verified domain (sapphireclinicseast.org
// is already verified for noreply@do-not-reply.*). Override via
// UGAT_MAIL_FROM if the verified sender differs.

const FROM =
  process.env.UGAT_MAIL_FROM ||
  'UGAT Fellowship — SCEI <scholarship@sapphireclinicseast.org>'

// Brand palette (mirrors the /ugatfellow landing page).
const DEEP = '#244952'
const GREEN = '#4a8073'
const GOLD = '#c69849'
const CREAM = '#edf3d9'

async function send(params: { to: string; subject: string; html: string; text?: string }): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) throw new Error('RESEND_API_KEY is not set')
  const { to, subject, html, text } = params
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: FROM,
      to: [to],
      subject,
      html,
      text: text ?? html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim(),
      reply_to: 'scholarship@sapphireclinicseast.org',
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error('Resend API ' + res.status + ': ' + body.slice(0, 400))
  }
}

/** Send the "verify your email" message with a one-time link. */
export async function sendUgatVerificationEmail(params: {
  to: string
  firstName: string
  verifyUrl: string
}): Promise<void> {
  const { to, firstName, verifyUrl } = params
  const subject = 'Verify your email — UGAT Fellowship Program'
  const html = `
  <div style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(36,73,82,0.12)">
        <div style="background:${DEEP};padding:28px 28px 24px;text-align:center">
          <div style="font-family:'Montserrat',Arial,sans-serif;color:${CREAM};font-size:13px;letter-spacing:3px;text-transform:uppercase">Aura Foundation</div>
          <div style="font-family:'Montserrat',Arial,sans-serif;color:#ffffff;font-size:26px;font-weight:800;margin-top:6px">UGAT Fellowship Program</div>
          <div style="color:${GOLD};font-size:12px;letter-spacing:1px;margin-top:6px">Ugnayan para sa Galing, Aral, at Tindig</div>
        </div>
        <div style="padding:30px 30px 26px;color:${DEEP}">
          <h2 style="margin:0 0 12px;font-family:'Montserrat',Arial,sans-serif;font-size:20px">Hi ${escapeHtml(firstName)},</h2>
          <p style="margin:0 0 16px;line-height:1.6;font-size:15px">
            Welcome to the <strong>UGAT Fellowship Program</strong>. Please confirm your
            email address to activate your scholar account and sign in.
          </p>
          <div style="text-align:center;margin:26px 0">
            <a href="${verifyUrl}"
               style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;
                      font-family:'Montserrat',Arial,sans-serif;font-weight:700;font-size:15px;
                      padding:14px 30px;border-radius:999px">Verify my email</a>
          </div>
          <p style="margin:0 0 8px;line-height:1.6;font-size:13px;color:${GREEN}">
            Or paste this link into your browser:
          </p>
          <p style="margin:0 0 20px;word-break:break-all;font-size:12px;color:#64748b">
            <a href="${verifyUrl}" style="color:${GOLD}">${verifyUrl}</a>
          </p>
          <p style="margin:0;line-height:1.6;font-size:12px;color:#94a3b8">
            This link expires in 48 hours. If you didn't create a UGAT Fellowship
            account, you can safely ignore this email.
          </p>
        </div>
        <div style="background:${CREAM};padding:16px 28px;text-align:center;color:${DEEP};font-size:11px;line-height:1.5">
          Sapphire Clinics East, Inc. is compliant with the Data Privacy Act of 2012
          (RA 10173) and registered with the National Privacy Commission.<br>
          Questions? Reply to this email or write to scholarship@sapphireclinicseast.org.
        </div>
      </div>
    </div>
  </div>`
  await send({ to, subject, html })
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
