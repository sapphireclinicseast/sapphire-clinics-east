// UGAT Fellowship transactional email — verification link.
//
// Sends DIRECTLY through the scholarship@sapphireclinicseast.org Gmail
// mailbox via the Gmail API (HTTPS, port 443 — the VPS blocks outbound
// SMTP). This reuses the OAuth plumbing in src/lib/email.ts and the
// GmailAccount table: connect the mailbox once at
//   /api/auth/google  →  Settings ▸ Accounts  (pick scholarship@…)
// which upserts a GmailAccount row we look up here by address.
//
// Resolution order for the sending account's refresh token:
//   1. UGAT_GMAIL_REFRESH_TOKEN env (explicit override)
//   2. GmailAccount row whose email == UGAT_MAIL_FROM_ADDRESS
// The message shows "From: UGAT Fellowship <that address>".

import { getGmailClient } from './email'
import { prisma } from './prisma'

const FROM_ADDRESS = process.env.UGAT_MAIL_FROM_ADDRESS || 'scholarship@sapphireclinicseast.org'
const FROM_NAME = 'UGAT Fellowship'

// Brand palette (mirrors the /ugatfellow landing page).
const DEEP = '#244952'
const GREEN = '#4a8073'
const GOLD = '#c69849'
const CREAM = '#edf3d9'

/** Find the refresh token for the scholarship@ mailbox. */
async function resolveRefreshToken(): Promise<string> {
  if (process.env.UGAT_GMAIL_REFRESH_TOKEN) return process.env.UGAT_GMAIL_REFRESH_TOKEN
  const acct = await prisma.gmailAccount.findUnique({
    where: { email: FROM_ADDRESS },
    select: { refreshToken: true },
  })
  if (acct?.refreshToken) return acct.refreshToken
  throw new Error(
    `No Gmail account connected for ${FROM_ADDRESS}. Connect it once at /api/auth/google (Settings ▸ Accounts), signing in as ${FROM_ADDRESS}.`,
  )
}

/** Build an RFC 2822 message (base64url) branded for the UGAT sender. */
function buildRaw(to: string[], subject: string, html: string): string {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  const bodyBase64 = Buffer.from(html, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  const message = [
    `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
    `To: ${to.join(', ')}`,
    `Reply-To: ${FROM_ADDRESS}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64,
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}

async function send(params: { to: string | string[]; subject: string; html: string }): Promise<void> {
  const { to, subject, html } = params
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean)
  if (recipients.length === 0) throw new Error('No recipients')
  const refreshToken = await resolveRefreshToken()
  const gmail = await getGmailClient(refreshToken)
  const raw = buildRaw(recipients, subject, html)
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

/** Build a multipart/mixed message with an HTML body + one PDF attachment. */
function buildRawWithPdf(to: string[], subject: string, html: string, filename: string, pdf: Buffer): string {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  const b = 'ugat_mixed_boundary_2f8c1e'
  const htmlB64 = Buffer.from(html, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  const pdfB64 = pdf.toString('base64').replace(/(.{76})/g, '$1\r\n')
  const message = [
    `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
    `To: ${to.join(', ')}`,
    `Reply-To: ${FROM_ADDRESS}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${b}"`,
    '',
    `--${b}`,
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    htmlB64,
    `--${b}`,
    `Content-Type: application/pdf; name="${filename}"`,
    `Content-Disposition: attachment; filename="${filename}"`,
    'Content-Transfer-Encoding: base64',
    '',
    pdfB64,
    `--${b}--`,
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}

async function sendWithPdf(params: { to: string | string[]; subject: string; html: string; filename: string; pdf: Buffer }): Promise<void> {
  const recipients = (Array.isArray(params.to) ? params.to : [params.to]).filter(Boolean)
  if (recipients.length === 0) throw new Error('No recipients')
  const refreshToken = await resolveRefreshToken()
  const gmail = await getGmailClient(refreshToken)
  const raw = buildRawWithPdf(recipients, params.subject, params.html, params.filename, params.pdf)
  await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
}

/** Build a broadcast message: To the mailbox itself, everyone on Bcc (so
 *  recipients don't see each other). */
function buildRawBcc(bcc: string[], subject: string, html: string): string {
  const subjectEncoded = `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
  const bodyBase64 = Buffer.from(html, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  const message = [
    `From: ${FROM_NAME} <${FROM_ADDRESS}>`,
    `To: ${FROM_NAME} <${FROM_ADDRESS}>`,
    `Bcc: ${bcc.join(', ')}`,
    `Reply-To: ${FROM_ADDRESS}`,
    `Subject: ${subjectEncoded}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    bodyBase64,
  ].join('\r\n')
  return Buffer.from(message).toString('base64url')
}

/** Broadcast "applications are now open" to all account holders (Bcc,
 *  chunked). Returns how many recipient addresses were mailed. */
export async function sendUgatCycleOpenEmail(params: {
  recipients: string[]
  academicYear: string
  closesAt?: Date | string | null
  applyUrl: string
}): Promise<{ sent: number }> {
  const recipients = [...new Set(params.recipients.filter(Boolean))]
  if (recipients.length === 0) return { sent: 0 }

  const closes = params.closesAt ? new Date(params.closesAt).toLocaleDateString('en-PH', { month: 'long', day: 'numeric', year: 'numeric' }) : null
  const subject = `Applications are now open — UGAT Fellowship (A.Y. ${params.academicYear})`
  const html = `
  <div style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(36,73,82,0.12)">
        <div style="background:${DEEP};padding:28px 28px 24px;text-align:center">
          <div style="font-family:'Montserrat',Arial,sans-serif;color:#ffffff;font-size:26px;font-weight:800">UGAT Fellowship Program</div>
          <div style="color:${GOLD};font-size:12px;letter-spacing:1px;margin-top:6px">Ugnayan para sa Galing, Aral, at Tindig</div>
        </div>
        <div style="padding:30px 30px 26px;color:${DEEP}">
          <h2 style="margin:0 0 12px;font-family:'Montserrat',Arial,sans-serif;font-size:20px">Applications are now open!</h2>
          <p style="margin:0 0 16px;line-height:1.6;font-size:15px">
            We&rsquo;re delighted to share that applications for the <strong>UGAT Fellowship Program</strong>
            for <strong>Academic Year ${escapeHtml(params.academicYear)}</strong> are now open.
            ${closes ? `Please complete and submit your application on or before <strong>${escapeHtml(closes)}</strong>.` : ''}
          </p>
          <p style="margin:0 0 16px;line-height:1.6;font-size:15px">
            Sign in to your account to begin — the application walks you through the questions,
            your motivational letter, proof of grades, and a short declaration.
          </p>
          <div style="text-align:center;margin:26px 0">
            <a href="${params.applyUrl}"
               style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;
                      font-family:'Montserrat',Arial,sans-serif;font-weight:700;font-size:15px;
                      padding:14px 30px;border-radius:999px">Sign in &amp; apply</a>
          </div>
          <p style="margin:0;line-height:1.6;font-size:12px;color:#94a3b8">
            You&rsquo;re receiving this because you created a UGAT Fellowship account.
            Reach us anytime at scholarship@sapphireclinicseast.org.
          </p>
        </div>
        <div style="background:${CREAM};padding:16px 28px;text-align:center;color:${DEEP};font-size:11px;line-height:1.5">
          Sapphire Clinics East, Inc. is compliant with the Data Privacy Act of 2012
          (RA 10173) and registered with the National Privacy Commission.
        </div>
      </div>
    </div>
  </div>`

  const refreshToken = await resolveRefreshToken()
  const gmail = await getGmailClient(refreshToken)
  const CHUNK = 60
  for (let i = 0; i < recipients.length; i += CHUNK) {
    const raw = buildRawBcc(recipients.slice(i, i + CHUNK), subject, html)
    await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
  }
  return { sent: recipients.length }
}

/** Send the "verify your email" message with a one-time link. */
export async function sendUgatVerificationEmail(params: {
  to: string | string[]
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
          <div style="font-family:'Montserrat',Arial,sans-serif;color:#ffffff;font-size:26px;font-weight:800">UGAT Fellowship Program</div>
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

/** Interview scheduled — Jitsi link + "add to Google Calendar". */
export async function sendUgatInterviewEmail(params: {
  to: string | string[]
  firstName: string
  whenText: string
  jitsiUrl: string
  gcalUrl: string
}): Promise<void> {
  const { to, firstName, whenText, jitsiUrl, gcalUrl } = params
  const subject = 'Your UGAT Fellowship interview is scheduled'
  const html = `
  <div style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(36,73,82,0.12)">
        <div style="background:${DEEP};padding:26px;text-align:center">
          <div style="font-family:'Montserrat',Arial,sans-serif;color:#ffffff;font-size:22px;font-weight:800">UGAT Fellowship — Interview</div>
        </div>
        <div style="padding:28px 30px;color:${DEEP}">
          <h2 style="margin:0 0 12px;font-family:'Montserrat',Arial,sans-serif;font-size:19px">Hi ${escapeHtml(firstName)},</h2>
          <p style="margin:0 0 14px;line-height:1.6;font-size:15px">Your interview for the UGAT Fellowship Program is confirmed for:</p>
          <div style="background:${CREAM};border-radius:12px;padding:16px 18px;margin:0 0 18px;font-size:16px;font-weight:700;color:${DEEP}">${escapeHtml(whenText)}</div>
          <p style="margin:0 0 18px;line-height:1.6;font-size:14px">Please join the video call at your scheduled time using the link below.</p>
          <div style="text-align:center;margin:8px 0 6px">
            <a href="${jitsiUrl}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-family:'Montserrat',Arial,sans-serif;font-weight:700;font-size:15px;padding:13px 26px;border-radius:999px">Join the video interview</a>
          </div>
          <p style="margin:6px 0 18px;text-align:center;font-size:12px"><a href="${gcalUrl}" style="color:${GOLD}">Add this to your Google Calendar</a></p>
          <p style="margin:0 0 6px;font-size:12px;color:${GREEN}">Meeting link:</p>
          <p style="margin:0;word-break:break-all;font-size:12px"><a href="${jitsiUrl}" style="color:${GOLD}">${jitsiUrl}</a></p>
        </div>
        <div style="background:${CREAM};padding:16px 28px;text-align:center;color:${DEEP};font-size:11px">Questions? Reply to this email or write to scholarship@sapphireclinicseast.org.</div>
      </div>
    </div>
  </div>`
  await send({ to, subject, html })
}

/** Accepted! Your Fellowship Loan Agreement is ready to review + e-sign. */
export async function sendUgatContractEmail(params: { to: string | string[]; firstName: string; signUrl: string }): Promise<void> {
  const { to, firstName, signUrl } = params
  const subject = 'Congratulations! Your UGAT Fellowship agreement is ready'
  const html = `
  <div style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(36,73,82,0.12)">
        <div style="background:${DEEP};padding:26px;text-align:center">
          <div style="font-family:'Montserrat',Arial,sans-serif;color:${GOLD};font-size:12px;letter-spacing:2px;text-transform:uppercase">You&rsquo;re an UGAT Fellow</div>
          <div style="font-family:'Montserrat',Arial,sans-serif;color:#ffffff;font-size:24px;font-weight:800;margin-top:6px">Congratulations, ${escapeHtml(firstName)}!</div>
        </div>
        <div style="padding:28px 30px;color:${DEEP}">
          <p style="margin:0 0 14px;line-height:1.6;font-size:15px">We&rsquo;re delighted to welcome you to the UGAT Fellowship Program. Your <strong>Fellowship Loan Agreement</strong> is now ready for you to review and sign online.</p>
          <p style="margin:0 0 18px;line-height:1.6;font-size:15px">Sign in to your account to complete it — you&rsquo;ll fill in your co-maker&rsquo;s details, upload two valid IDs for each of you, and sign electronically. A hard copy will be signed in person when you visit an Aura Health Rehab branch.</p>
          <div style="text-align:center;margin:22px 0">
            <a href="${signUrl}" style="display:inline-block;background:${GREEN};color:#ffffff;text-decoration:none;font-family:'Montserrat',Arial,sans-serif;font-weight:700;font-size:15px;padding:13px 28px;border-radius:999px">Review &amp; sign my agreement</a>
          </div>
        </div>
        <div style="background:${CREAM};padding:16px 28px;text-align:center;color:${DEEP};font-size:11px">Questions? Reply to this email or write to scholarship@sapphireclinicseast.org.</div>
      </div>
    </div>
  </div>`
  await send({ to, subject, html })
}

/** Confirmation that the soft copy was signed, with the generated PDF attached. */
export async function sendUgatSignedRsaEmail(params: { to: string | string[]; firstName: string; track?: string | null; pdf: Buffer }): Promise<void> {
  const { to, firstName, track, pdf } = params
  const trackLabel = track === 'TINDIG' ? 'Tindig Track' : 'Aral Track'
  const subject = 'Your signed UGAT Fellowship Loan Agreement'
  const html = `
  <div style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(36,73,82,0.12)">
        <div style="background:${DEEP};padding:26px;text-align:center">
          <div style="font-family:'Montserrat',Arial,sans-serif;color:${GOLD};font-size:12px;letter-spacing:2px;text-transform:uppercase">Agreement signed &mdash; soft copy</div>
          <div style="font-family:'Montserrat',Arial,sans-serif;color:#ffffff;font-size:22px;font-weight:800;margin-top:6px">Thank you, ${escapeHtml(firstName)}!</div>
        </div>
        <div style="padding:28px 30px;color:${DEEP}">
          <p style="margin:0 0 14px;line-height:1.6;font-size:15px">We&rsquo;ve received your electronically signed <strong>Fellowship Loan Agreement</strong> (UGAT Fellowship &mdash; ${trackLabel}). A PDF copy is attached to this email for your records.</p>
          <p style="margin:0 0 14px;line-height:1.6;font-size:15px"><strong>One step remains:</strong> to finalize, please sign the <strong>hard copy in person</strong>, together with your co-maker, at <strong>Aura Health Rehab &ndash; East</strong> (Robinsons Metro East, Pasig) or <strong>Greenhills</strong> (GH Tower, San Juan). Kindly bring the valid IDs you uploaded.</p>
          <p style="margin:0;line-height:1.6;font-size:14px;color:${GREEN}">Welcome aboard &mdash; we&rsquo;re glad to have you with us.</p>
        </div>
        <div style="background:${CREAM};padding:16px 28px;text-align:center;color:${DEEP};font-size:11px">Questions? Reply to this email or write to scholarship@sapphireclinicseast.org.</div>
      </div>
    </div>
  </div>`
  await sendWithPdf({ to, subject, html, filename: 'UGAT-Fellowship-Loan-Agreement-Signed.pdf', pdf })
}

/** Empathic "not considered for the next step" notice. */
export async function sendUgatRejectionEmail(params: { to: string | string[]; firstName: string }): Promise<void> {
  const { to, firstName } = params
  const subject = 'An update on your UGAT Fellowship application'
  const html = `
  <div style="margin:0;padding:0;background:${CREAM};font-family:Arial,Helvetica,sans-serif">
    <div style="max-width:560px;margin:0 auto;padding:32px 20px">
      <div style="background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid rgba(36,73,82,0.12)">
        <div style="background:${DEEP};padding:24px;text-align:center">
          <div style="font-family:'Montserrat',Arial,sans-serif;color:#ffffff;font-size:20px;font-weight:800">UGAT Fellowship Program</div>
        </div>
        <div style="padding:28px 30px;color:${DEEP}">
          <h2 style="margin:0 0 12px;font-family:'Montserrat',Arial,sans-serif;font-size:19px">Dear ${escapeHtml(firstName)},</h2>
          <p style="margin:0 0 14px;line-height:1.65;font-size:15px">Thank you for applying to the UGAT Fellowship Program and for the time and heart you put into your application. It was a genuine privilege to learn about your journey.</p>
          <p style="margin:0 0 14px;line-height:1.65;font-size:15px">After careful consideration, we are unable to move your application forward to the next step at this time. Please know this reflects the limited number of slots we have — not your worth or your promise as a future clinician.</p>
          <p style="margin:0 0 14px;line-height:1.65;font-size:15px">We sincerely hope you&rsquo;ll consider applying again in a future cycle, and we wish you every success in your internship and licensure. Extensions and future openings are usually announced on your account and by email.</p>
          <p style="margin:0;line-height:1.65;font-size:15px">With warmth and respect,<br><strong>The UGAT Fellowship Team</strong><br>Sapphire Clinics East, Inc.</p>
        </div>
        <div style="background:${CREAM};padding:16px 28px;text-align:center;color:${DEEP};font-size:11px">You&rsquo;re welcome to reach us anytime at scholarship@sapphireclinicseast.org.</div>
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
