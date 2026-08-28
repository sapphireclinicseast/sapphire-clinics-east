import { google, type gmail_v1 } from 'googleapis'

/**
 * Outbound email via the Gmail API, replacing Resend.
 *
 * The Gmail API rather than Gmail SMTP because the VPS blocks outbound SMTP —
 * the same reason the Resend integration used its HTTP API instead of its SMTP
 * relay.
 *
 * Gmail sends as the mailbox its refresh token authenticates, so unlike Resend
 * the From address is not free-form: whatever mailbox you connect is the sender.
 * The old no-reply relay address is therefore gone, and replies land somewhere a
 * person actually reads — which is what the reply-to override was working around.
 *
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   OAuth client
 *   GOOGLE_REFRESH_TOKEN                      the sending mailbox
 *   GMAIL_FROM_NAME                           display name (optional)
 */

const FROM_NAME = process.env.GMAIL_FROM_NAME || 'Verdana Rehab Solutions'

let _gmail: gmail_v1.Gmail | null = null
let _address: string | null = null

function getGmail(): gmail_v1.Gmail {
  if (_gmail) return _gmail
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error('Gmail credentials missing: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and GOOGLE_REFRESH_TOKEN')
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  _gmail = google.gmail({ version: 'v1', auth: oauth2 })
  return _gmail
}

/** The authenticated mailbox's own address, which is the only valid From.
 *  GMAIL_SENDER skips the profile lookup — a gmail.send-only token (the scope
 *  our shared refresh token carries) is not allowed to call getProfile. */
async function fromAddress(): Promise<string> {
  if (_address) return _address
  if (process.env.GMAIL_SENDER) { _address = process.env.GMAIL_SENDER; return _address }
  const profile = await getGmail().users.getProfile({ userId: 'me' })
  _address = profile.data.emailAddress || 'verdanatrading@gmail.com'
  return _address
}

export function gmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoded-word — order confirmations carry an emoji in the subject.
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

function buildRaw(opts: {
  from: string
  to: string[]
  bcc?: string[]
  replyTo?: string
  subject: string
  body: string
  isHtml: boolean
}): string {
  const headers = [
    `From: ${FROM_NAME} <${opts.from}>`,
    `To: ${opts.to.join(', ')}`,
    ...(opts.bcc?.length ? [`Bcc: ${opts.bcc.join(', ')}`] : []),
    ...(opts.replyTo ? [`Reply-To: ${opts.replyTo}`] : []),
    `Subject: ${encodeSubject(opts.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: ${opts.isHtml ? 'text/html' : 'text/plain'}; charset=utf-8`,
    'Content-Transfer-Encoding: base64',
  ]
  // 76-char lines per RFC 2045; Gmail rejects longer ones.
  const body = Buffer.from(opts.body, 'utf-8').toString('base64').replace(/(.{76})/g, '$1\r\n')
  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf-8').toString('base64url')
}

export interface SendResult { ok: boolean; error?: string }

/** Send one message. Never throws — order confirmations must not fail a checkout. */
export async function sendGmail(opts: {
  to: string | string[]
  bcc?: string | string[]
  replyTo?: string
  subject: string
  html?: string
  text?: string
}): Promise<SendResult> {
  const to = (Array.isArray(opts.to) ? opts.to : [opts.to]).filter(Boolean)
  const bcc = opts.bcc ? (Array.isArray(opts.bcc) ? opts.bcc : [opts.bcc]).filter(Boolean) : undefined
  if (!to.length) return { ok: false, error: 'no recipient' }

  try {
    const from = await fromAddress()
    const raw = buildRaw({
      from, to, bcc, replyTo: opts.replyTo,
      subject: opts.subject,
      body: opts.html ?? opts.text ?? '',
      isHtml: !!opts.html,
    })
    await getGmail().users.messages.send({ userId: 'me', requestBody: { raw } })
    return { ok: true }
  } catch (err) {
    const e = err as { message?: string; code?: number }
    console.error('[Gmail] send failed:', e?.code, e?.message)
    return { ok: false, error: e?.message || 'unknown error' }
  }
}
