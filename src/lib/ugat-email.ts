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
// The message shows "From: UGAT Fellowship — Aura Foundation <that address>".

import { getGmailClient } from './email'
import { prisma } from './prisma'

const FROM_ADDRESS = process.env.UGAT_MAIL_FROM_ADDRESS || 'scholarship@sapphireclinicseast.org'
const FROM_NAME = 'UGAT Fellowship — Aura Foundation'

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
