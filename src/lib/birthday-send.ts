/**
 * Sending a birthday greeting — the email and the SMS, in one place.
 *
 * This used to live inside the two routes the dashboard buttons called, which
 * meant the automatic sweep could only have the same wording by copying it,
 * and the copy would drift the first time anybody edited one of them. The
 * routes now call these too, so a patient greeted by the cron and a patient
 * greeted by hand receive exactly the same message.
 *
 * Neither function records anything. Recording is the caller's job, after the
 * provider has accepted the send — see recordBirthdayGreeting.
 */

import { getGmailClient, getLegacyRefreshToken } from '@/lib/email'
import { getBranchNotifyConfig, getBranchSender } from '@/lib/branch-notify-config'

const LOGO_URL = 'https://operations.sapphireclinicseast.org/brand/aura-logo-color.png'

/** 'SBEA' / 'SBGH' — also accepts the Patient enum spelling. */
export function normaliseBranch(branch?: string | null): 'SBEA' | 'SBGH' | null {
  if (branch === 'SBEA' || branch === 'SANDBOX_EAST') return 'SBEA'
  if (branch === 'SBGH' || branch === 'SANDBOX_GREENHILLS') return 'SBGH'
  return null
}

export function clinicNameForBranch(branch?: string | null): string {
  const b = normaliseBranch(branch)
  if (b === 'SBEA') return 'Aura Health Rehab East'
  if (b === 'SBGH') return 'Aura Health Rehab Greenhills'
  return 'Aura Health Rehab'
}

/** The short name used in the SMS, which has 160 characters to live in. */
export function smsClinicName(branch?: string | null): string {
  const b = normaliseBranch(branch)
  if (b === 'SBEA') return 'Aura Health East'
  if (b === 'SBGH') return 'Aura Health Greenhills'
  return 'Aura Health Rehab Clinic'
}

/**
 * The SMS text.
 *
 * Kept exactly as the dashboard button built it, emoji included. They push the
 * message into UCS-2 and so into more than one segment — but this is the
 * message the clinic has been sending for a year, and quietly restyling every
 * patient's birthday text to save a few centavos is not this change's call to
 * make.
 */
export function birthdayMessage(firstName: string, branch?: string | null): string {
  return `Happy Birthday, ${firstName}! 🎂 Wishing you a wonderful day filled with joy and good health! From all of us at ${smsClinicName(branch)}. 💚`
}

// ── SMS ──────────────────────────────────────────────────────────────────────

const SMS_CONFIG: Record<string, { httpSmsKey: string; phone: string }> = {
  SBEA: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '', phone: '+639171189289' },
  SBGH: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '', phone: '+639177701686' },
}

export function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0')  && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10)                            return '+63' + digits
  return '+' + digits
}

/**
 * Hand one birthday SMS to httpSMS.
 *
 * Throws on anything that means the message did not go. The caller records the
 * greeting only when this returns, so a gateway that is down leaves the
 * patient un-greeted and greetable tomorrow rather than marked done.
 */
export async function sendBirthdaySms(opts: {
  firstName: string
  phone: string
  branch: string
  /** Overrides the standard text. The dashboard used to pass its own copy. */
  message?: string
}): Promise<void> {
  const b = normaliseBranch(opts.branch)
  const cfg = b ? SMS_CONFIG[b] : null
  if (!cfg?.httpSmsKey) throw new Error('SMS gateway not configured for this branch')

  const res = await fetch('https://api.httpsms.com/v1/messages/send', {
    method: 'POST',
    headers: { 'x-api-key': cfg.httpSmsKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      content: opts.message ?? birthdayMessage(opts.firstName, b),
      from: cfg.phone,
      to: toE164(opts.phone),
      // Keep trying for 24 hours in case the phone running httpSMS is offline.
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!res.ok) throw new Error(`httpSMS error ${res.status}: ${await res.text()}`)
}

// ── Email ────────────────────────────────────────────────────────────────────

export function buildBirthdayEmailHtml(firstName: string, clinicName: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Happy Birthday from ${clinicName}!</title>
</head>
<body style="margin:0;padding:0;background:#edf3d9;font-family:Arial,Helvetica,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#edf3d9;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(36,73,82,0.12);">

          <!-- Header: paper background with full-color logo -->
          <tr>
            <td style="background:linear-gradient(160deg,#edf3d9 0%,#d4e8d8 100%);padding:36px 40px 28px;text-align:center;">
              <img src="${LOGO_URL}" alt="${clinicName}" style="height:130px;max-width:300px;display:inline-block;margin-bottom:20px;">
              <h1 style="color:#244952;margin:0;font-size:26px;font-weight:800;letter-spacing:-0.5px;">
                Happy Birthday, ${firstName}!
              </h1>
              <p style="color:#4a8073;margin:8px 0 0;font-size:14px;font-weight:500;">
                Wishing you a wonderful day! 🎉
              </p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <p style="color:#244952;font-size:16px;line-height:1.7;margin:0 0 20px;">
                Dear <strong>${firstName}</strong>,
              </p>
              <p style="color:#244952;font-size:15px;line-height:1.8;margin:0 0 20px;">
                On behalf of everyone at <strong>${clinicName}</strong>, we want to wish you a very
                <strong style="color:#4a8073;">Happy Birthday!</strong>
              </p>
              <p style="color:#244952;font-size:15px;line-height:1.8;margin:0 0 24px;">
                We are grateful to have you as part of our clinic family. Your health and well-being
                mean the world to us &mdash; today and every day. May this special day bring you joy,
                laughter, and wonderful memories!
              </p>

              <!-- Birthday highlight -->
              <div style="background:rgba(198,152,73,0.08);border:2px solid #c69849;border-radius:12px;padding:22px 24px;text-align:center;margin-bottom:28px;">
                <p style="color:#c69849;font-size:20px;font-weight:800;margin:0 0 8px;">
                  ✨ You&rsquo;re a star! ✨
                </p>
                <p style="color:#244952;font-size:14px;margin:0;font-style:italic;">
                  &ldquo;May you continue to shine brightly in everything you do.&rdquo;
                </p>
              </div>

              <p style="color:#244952;font-size:15px;line-height:1.8;margin:0 0 8px;">
                With warmest wishes,
              </p>
              <p style="color:#244952;font-size:16px;font-weight:700;margin:0 0 2px;">
                The ${clinicName} Team
              </p>
              <p style="margin:0;"><a href="https://www.sapphireclinicseast.org" style="color:#4a8073;font-size:13px;">www.sapphireclinicseast.org</a></p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#244952;border-top:1px solid #193339;padding:16px 40px;text-align:center;">
              <p style="color:rgba(237,243,217,0.55);font-size:11px;margin:0;">
                You received this because you are a valued patient.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

/**
 * Send one birthday email from the branch's own mailbox.
 *
 * Throws when there is no mailbox to send from or Gmail refuses, for the same
 * reason as the SMS: a greeting the patient never received must not be
 * recorded as sent.
 */
export async function sendBirthdayEmail(opts: {
  firstName: string
  email: string
  branch?: string | null
}): Promise<void> {
  const clinicName = clinicNameForBranch(opts.branch)

  // The branch's own mailbox, as reminders and absence notices already do.
  // findFirst() used to return whichever account sorted first — main@ — so an
  // East patient's greeting arrived from the corporate mailbox and any reply
  // landed in the wrong inbox.
  const cfg = await getBranchNotifyConfig(normaliseBranch(opts.branch) ?? 'SBEA')
  const sender = await getBranchSender(cfg)
  let refreshToken: string | null = sender?.refreshToken ?? null
  const senderEmail = sender?.email ?? 'noreply@sapphireclinicseast.org'
  if (sender && !sender.isBranchMailbox) {
    console.warn(
      `[birthday] ${cfg.ccEmail} is not a connected Gmail account — ` +
      `sending as ${sender.email} instead. Connect it under Settings → Email.`,
    )
  }
  if (!refreshToken) refreshToken = getLegacyRefreshToken()
  if (!refreshToken) throw new Error('No Gmail account connected')

  const gmail = await getGmailClient(refreshToken)
  const html = buildBirthdayEmailHtml(opts.firstName, clinicName)
  const encode2047 = (s: string) => `=?UTF-8?B?${Buffer.from(s, 'utf-8').toString('base64')}?=`

  const rawLines = [
    `From: ${encode2047(clinicName)} <${senderEmail}>`,
    `To: ${opts.email}`,
    `Subject: ${encode2047(`Happy Birthday, ${opts.firstName}! — ${clinicName}`)}`,
    'MIME-Version: 1.0',
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    Buffer.from(html, 'utf-8').toString('base64'),
  ]
  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(rawLines.join('\r\n')).toString('base64url') },
  })
}
