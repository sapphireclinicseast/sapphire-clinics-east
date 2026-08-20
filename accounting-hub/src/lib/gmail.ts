import { google, type gmail_v1 } from 'googleapis'

/**
 * Outbound email via the Gmail API (HTTPS), replacing Resend.
 *
 * It has to be the API, not SMTP: the VPS blocks outbound SMTP, which is why
 * the old Resend integration used its HTTP API too, and why the Resend SMTP
 * relay in forgot-password never actually delivered.
 *
 * MULTI-MAILBOX: Gmail only sends as the mailbox the token authenticates, so a
 * message that must come from hr.east@ needs hr.east@'s own refresh token — a
 * From header alone is rejected. Each mailbox therefore carries its own token,
 * sharing one OAuth client:
 *
 *   GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET   shared OAuth client
 *   GOOGLE_REFRESH_TOKEN                      main@   (default)
 *   GMAIL_REFRESH_TOKEN_HR_EAST               hr.east@
 *   GMAIL_REFRESH_TOKEN_HR_GH                 hr.gh@
 *
 * A mailbox with no token configured falls back to main@ rather than throwing,
 * so payroll keeps sending if only the HR tokens are missing — the caller can
 * report which address was actually used.
 */

export type Mailbox = 'main' | 'hr.east' | 'hr.gh'

interface MailboxConfig {
  address: string
  displayName: string
  tokenEnv: string
}

const MAILBOXES: Record<Mailbox, MailboxConfig> = {
  'main': {
    address: 'main@sapphireclinicseast.org',
    displayName: 'Sapphire Clinics East Inc.',
    tokenEnv: 'GOOGLE_REFRESH_TOKEN',
  },
  'hr.east': {
    address: 'hr.east@sapphireclinicseast.org',
    displayName: 'Aura Health Rehab Payroll — East',
    tokenEnv: 'GMAIL_REFRESH_TOKEN_HR_EAST',
  },
  'hr.gh': {
    address: 'hr.gh@sapphireclinicseast.org',
    displayName: 'Aura Health Rehab Payroll — Greenhills',
    tokenEnv: 'GMAIL_REFRESH_TOKEN_HR_GH',
  },
}

/** Resolve a mailbox to the one that actually has a token, falling back to main@. */
export function resolveMailbox(want: Mailbox): { mailbox: Mailbox; config: MailboxConfig; fellBack: boolean } {
  const wanted = MAILBOXES[want] || MAILBOXES.main
  if (process.env[wanted.tokenEnv]) return { mailbox: want, config: wanted, fellBack: false }
  return { mailbox: 'main', config: MAILBOXES.main, fellBack: want !== 'main' }
}

export function mailboxAddress(m: Mailbox): string {
  return (MAILBOXES[m] || MAILBOXES.main).address
}

const clients = new Map<string, gmail_v1.Gmail>()

function getGmail(tokenEnv: string): gmail_v1.Gmail {
  const cached = clients.get(tokenEnv)
  if (cached) return cached
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env[tokenEnv]
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(`Gmail credentials missing: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and ${tokenEnv}`)
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  const client = google.gmail({ version: 'v1', auth: oauth2 })
  clients.set(tokenEnv, client)
  return client
}

/** Attachment content is base64 (what the PDF builders already produce) or a Buffer. */
export interface GmailAttachment {
  filename: string
  content: string | Buffer
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoded-word so non-ASCII (₱, é) in the Subject renders correctly.
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

function chunkBase64(b64: string): string {
  // 76-char lines per RFC 2045 — Gmail rejects longer ones.
  return b64.replace(/(.{76})/g, '$1\r\n')
}

function mimeTypeOf(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  const map: Record<string, string> = {
    pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', webp: 'image/webp', txt: 'text/plain', csv: 'text/csv',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  }
  return map[ext] ?? 'application/octet-stream'
}

function toBase64(content: string | Buffer): string {
  if (Buffer.isBuffer(content)) return content.toString('base64')
  // Tolerate a data: URL prefix — several callers pass the raw FileReader output.
  return content.includes('base64,') ? content.split('base64,')[1] : content
}

function buildRawMessage(opts: {
  from: string
  to: string[]
  cc?: string[]
  replyTo?: string
  subject: string
  html: string
  attachments: GmailAttachment[]
}): string {
  const { from, to, cc, replyTo, subject, html, attachments } = opts
  const boundary = `----=_Mix_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const headers = [
    `From: ${from}`,
    `To: ${to.join(', ')}`,
    ...(cc?.length ? [`Cc: ${cc.join(', ')}`] : []),
    ...(replyTo ? [`Reply-To: ${replyTo}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
  ]

  const htmlPart = [
    'Content-Type: text/html; charset=utf-8',
    'Content-Transfer-Encoding: base64',
    '',
    chunkBase64(Buffer.from(html, 'utf-8').toString('base64')),
  ].join('\r\n')

  let body: string
  if (!attachments.length) {
    headers.push('Content-Type: text/html; charset=utf-8', 'Content-Transfer-Encoding: base64')
    body = chunkBase64(Buffer.from(html, 'utf-8').toString('base64'))
  } else {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    const parts = [`--${boundary}`, htmlPart]
    for (const att of attachments) {
      const safeName = att.filename.replace(/"/g, '')
      parts.push(`--${boundary}`, [
        `Content-Type: ${mimeTypeOf(att.filename)}; name="${safeName}"`,
        `Content-Disposition: attachment; filename="${safeName}"`,
        'Content-Transfer-Encoding: base64',
        '',
        chunkBase64(toBase64(att.content)),
      ].join('\r\n'))
    }
    parts.push(`--${boundary}--`)
    body = parts.join('\r\n')
  }

  return Buffer.from(`${headers.join('\r\n')}\r\n\r\n${body}`, 'utf-8').toString('base64url')
}

export interface SendResult { ok: boolean; from: string; fellBack: boolean; error?: string }

/**
 * Send one message. Never throws — callers surface `error` to the user instead,
 * matching how the Resend helpers behaved.
 */
export async function sendGmail(opts: {
  to: string | string[]
  cc?: string | string[]
  replyTo?: string
  subject: string
  html: string
  attachments?: GmailAttachment[]
  mailbox?: Mailbox
}): Promise<SendResult> {
  const { mailbox, config, fellBack } = resolveMailbox(opts.mailbox || 'main')
  const from = `${config.displayName} <${config.address}>`
  const to = Array.isArray(opts.to) ? opts.to : [opts.to]
  const cc = opts.cc ? (Array.isArray(opts.cc) ? opts.cc : [opts.cc]) : undefined

  try {
    const raw = buildRawMessage({
      from, to, cc, replyTo: opts.replyTo, subject: opts.subject,
      html: opts.html, attachments: opts.attachments || [],
    })
    await getGmail(config.tokenEnv).users.messages.send({ userId: 'me', requestBody: { raw } })
    return { ok: true, from: config.address, fellBack }
  } catch (err) {
    const e = err as { message?: string; code?: number }
    console.error(`[Gmail] send failed as ${config.address} (mailbox=${mailbox}):`, e?.code, e?.message)
    return { ok: false, from: config.address, fellBack, error: e?.message || 'unknown error' }
  }
}

/** True when at least the default mailbox can send — used for config checks. */
export function gmailConfigured(): boolean {
  return !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET && process.env.GOOGLE_REFRESH_TOKEN)
}
