import { google, type gmail_v1 } from 'googleapis'

// Send via Gmail API as main@sapphireclinicseast.org (Resend was suspended).
// Requires GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN
// (refresh token for the main@ mailbox). GMAIL_FROM_EMAIL overrides the
// default From header but must match the authenticated mailbox or Gmail
// will reject the send.

const FROM_EMAIL =
  process.env.GMAIL_FROM_EMAIL ??
  'Sapphire Clinics East <main@sapphireclinicseast.org>'

let _gmail: gmail_v1.Gmail | null = null
function getGmail(): gmail_v1.Gmail {
  if (_gmail) return _gmail
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN
  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      'Gmail credentials missing: set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN',
    )
  }
  const oauth2 = new google.auth.OAuth2(clientId, clientSecret)
  oauth2.setCredentials({ refresh_token: refreshToken })
  _gmail = google.gmail({ version: 'v1', auth: oauth2 })
  return _gmail
}

interface Attachment {
  filename: string
  content: Buffer
}

function encodeSubject(subject: string): string {
  // RFC 2047 encoded-word so non-ASCII/emoji in Subject renders correctly.
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

function chunkBase64(b64: string): string {
  // Break base64 into 76-char lines (RFC 2045); Gmail is strict about this.
  return b64.replace(/(.{76})/g, '$1\r\n')
}

function guessMimeType(filename: string): string {
  const ext = filename.toLowerCase().split('.').pop() ?? ''
  switch (ext) {
    case 'pdf': return 'application/pdf'
    case 'png': return 'image/png'
    case 'jpg':
    case 'jpeg': return 'image/jpeg'
    case 'gif': return 'image/gif'
    case 'webp': return 'image/webp'
    case 'txt': return 'text/plain'
    case 'csv': return 'text/csv'
    case 'doc': return 'application/msword'
    case 'docx': return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    case 'xls': return 'application/vnd.ms-excel'
    case 'xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    default: return 'application/octet-stream'
  }
}

function buildRawMessage(opts: {
  from: string
  to: string
  cc?: string[]
  subject: string
  html: string
  attachments?: Attachment[]
}): string {
  const { from, to, cc, subject, html, attachments } = opts
  const hasAttachments = attachments && attachments.length > 0
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`

  const headers = [
    `From: ${from}`,
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
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
  if (!hasAttachments) {
    headers.push('Content-Type: text/html; charset=utf-8')
    headers.push('Content-Transfer-Encoding: base64')
    body = chunkBase64(Buffer.from(html, 'utf-8').toString('base64'))
  } else {
    headers.push(`Content-Type: multipart/mixed; boundary="${boundary}"`)
    const parts: string[] = [`--${boundary}`, htmlPart]
    for (const att of attachments!) {
      const safeName = att.filename.replace(/"/g, '')
      const mime = guessMimeType(att.filename)
      parts.push(`--${boundary}`)
      parts.push(
        [
          `Content-Type: ${mime}; name="${safeName}"`,
          `Content-Disposition: attachment; filename="${safeName}"`,
          'Content-Transfer-Encoding: base64',
          '',
          chunkBase64(att.content.toString('base64')),
        ].join('\r\n'),
      )
    }
    parts.push(`--${boundary}--`)
    body = parts.join('\r\n')
  }

  const message = `${headers.join('\r\n')}\r\n\r\n${body}`
  return Buffer.from(message, 'utf-8').toString('base64url')
}

export async function sendEmail({
  to,
  cc,
  subject,
  html,
  attachments,
}: {
  to: string
  cc?: string | string[]
  subject: string
  html: string
  attachments?: Attachment[]
}) {
  const ccList = !cc ? undefined : Array.isArray(cc) ? cc : [cc]
  const raw = buildRawMessage({
    from: FROM_EMAIL,
    to,
    cc: ccList,
    subject,
    html,
    attachments,
  })

  try {
    const res = await getGmail().users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })
    return res.data
  } catch (err) {
    const e = err as { message?: string; code?: number }
    console.error('Gmail send error:', e?.code, e?.message)
    throw new Error(`Email send failed: ${e?.message ?? 'unknown error'}`)
  }
}
