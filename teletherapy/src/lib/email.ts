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

// An image embedded inline in the HTML via `cid:` reference (multipart/related),
// so it renders in the body without relying on remote-image loading (which many
// mail clients block by default). Reference it in HTML as <img src="cid:THE_CID">.
interface InlineImage {
  cid: string
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
  inlineImages?: InlineImage[]
}): string {
  const { from, to, cc, subject, html, attachments, inlineImages } = opts
  const hasAttachments = !!(attachments && attachments.length > 0)
  const hasInline = !!(inlineImages && inlineImages.length > 0)
  const uid = `${Date.now()}_${Math.random().toString(36).slice(2)}`
  const relBoundary = `----=_Rel_${uid}`
  const mixBoundary = `----=_Mix_${uid}`

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

  const inlinePart = (img: InlineImage) => {
    const safeName = img.filename.replace(/"/g, '')
    return [
      `Content-Type: ${guessMimeType(img.filename)}; name="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      `Content-ID: <${img.cid}>`,
      `Content-Disposition: inline; filename="${safeName}"`,
      '',
      chunkBase64(img.content.toString('base64')),
    ].join('\r\n')
  }

  const attachmentPart = (att: Attachment) => {
    const safeName = att.filename.replace(/"/g, '')
    return [
      `Content-Type: ${guessMimeType(att.filename)}; name="${safeName}"`,
      `Content-Disposition: attachment; filename="${safeName}"`,
      'Content-Transfer-Encoding: base64',
      '',
      chunkBase64(att.content.toString('base64')),
    ].join('\r\n')
  }

  // The HTML (optionally wrapped with its inline images in a multipart/related)
  // forms the "primary" body; attachments, if any, wrap everything in a
  // multipart/mixed. Four shapes: html | related | mixed[html] | mixed[related].
  const relatedBlock = () => {
    const parts = [`--${relBoundary}`, htmlPart]
    for (const img of inlineImages!) parts.push(`--${relBoundary}`, inlinePart(img))
    parts.push(`--${relBoundary}--`)
    return parts.join('\r\n')
  }

  let body: string
  if (!hasInline && !hasAttachments) {
    headers.push('Content-Type: text/html; charset=utf-8')
    headers.push('Content-Transfer-Encoding: base64')
    body = chunkBase64(Buffer.from(html, 'utf-8').toString('base64'))
  } else if (hasInline && !hasAttachments) {
    headers.push(`Content-Type: multipart/related; boundary="${relBoundary}"`)
    body = relatedBlock()
  } else if (!hasInline && hasAttachments) {
    headers.push(`Content-Type: multipart/mixed; boundary="${mixBoundary}"`)
    const parts: string[] = [`--${mixBoundary}`, htmlPart]
    for (const att of attachments!) parts.push(`--${mixBoundary}`, attachmentPart(att))
    parts.push(`--${mixBoundary}--`)
    body = parts.join('\r\n')
  } else {
    // Both inline images AND attachments: mixed[ related[html, inline...], att... ]
    headers.push(`Content-Type: multipart/mixed; boundary="${mixBoundary}"`)
    const relWrapper = [
      `Content-Type: multipart/related; boundary="${relBoundary}"`,
      '',
      relatedBlock(),
    ].join('\r\n')
    const parts: string[] = [`--${mixBoundary}`, relWrapper]
    for (const att of attachments!) parts.push(`--${mixBoundary}`, attachmentPart(att))
    parts.push(`--${mixBoundary}--`)
    body = parts.join('\r\n')
  }

  const message = `${headers.join('\r\n')}\r\n\r\n${body}`
  return Buffer.from(message, 'utf-8').toString('base64url')
}

// Branch-specific From header for patient-facing reports (Initial Evaluation,
// Progress Report). Falls back to the default mailbox for unknown branches.
// NOTE: for Gmail to accept these, east@/greenhills@ must be verified
// "Send mail as" aliases on the authenticated (main@) mailbox — otherwise the
// send is retried from FROM_EMAIL by sendEmail() below.
export function branchFromAddress(branch?: string | null): string {
  // Handle both branch representations: Patient.branch uses SANDBOX_EAST/
  // SANDBOX_GREENHILLS, while Staff.branch uses SBEA/SBGH.
  switch (branch) {
    case 'SBEA':
    case 'SANDBOX_EAST':
      return process.env.GMAIL_FROM_EAST ?? 'Aura Health East <east@sapphireclinicseast.org>'
    case 'SBGH':
    case 'SANDBOX_GREENHILLS':
      return process.env.GMAIL_FROM_GREENHILLS ?? 'Aura Health Greenhills <greenhills@sapphireclinicseast.org>'
    default:
      return FROM_EMAIL
  }
}

export async function sendEmail({
  to,
  cc,
  subject,
  html,
  attachments,
  inlineImages,
  from,
}: {
  to: string
  cc?: string | string[]
  subject: string
  html: string
  attachments?: Attachment[]
  inlineImages?: InlineImage[]
  from?: string
}) {
  const ccList = !cc ? undefined : Array.isArray(cc) ? cc : [cc]
  const send = async (fromAddr: string) => {
    const raw = buildRawMessage({ from: fromAddr, to, cc: ccList, subject, html, attachments, inlineImages })
    const res = await getGmail().users.messages.send({ userId: 'me', requestBody: { raw } })
    return res.data
  }

  const primaryFrom = from ?? FROM_EMAIL
  try {
    return await send(primaryFrom)
  } catch (err) {
    const e = err as { message?: string; code?: number }
    // A branch From that isn't a verified send-as alias will be rejected by
    // Gmail. Don't let that stop the report reaching the patient — retry once
    // from the default mailbox.
    if (primaryFrom !== FROM_EMAIL) {
      console.error('Gmail send from', primaryFrom, 'failed:', e?.code, e?.message, '— retrying from default')
      try {
        return await send(FROM_EMAIL)
      } catch (err2) {
        const e2 = err2 as { message?: string; code?: number }
        console.error('Gmail send error (fallback):', e2?.code, e2?.message)
        throw new Error(`Email send failed: ${e2?.message ?? 'unknown error'}`)
      }
    }
    console.error('Gmail send error:', e?.code, e?.message)
    throw new Error(`Email send failed: ${e?.message ?? 'unknown error'}`)
  }
}
