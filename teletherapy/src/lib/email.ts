import { google, type gmail_v1 } from 'googleapis'
import { prisma } from './prisma'

// Two ways to send as a given `from` address, tried in order (see
// sendEmail() below):
//   1. Domain-wide delegation — impersonates `from` directly via the
//      same service account HR Platform already uses for Drive +
//      Calendar (GOOGLE_SERVICE_ACCOUNT_KEY). Works for ANY mailbox on
//      sapphireclinicseast.org once that service account's Client ID
//      is authorized for the gmail.send scope in Workspace Admin
//      Console → Security → API Controls → Domain-wide Delegation — a
//      scope ADDITION to an already-delegated Client ID, not a new
//      authorization. Until then every impersonated send fails and
//      falls through to #2, so this is safe to ship ahead of that
//      landing.
//   2. Refresh-token transport — the original, single-mailbox
//      (main@sapphireclinicseast.org) path. Requires GOOGLE_CLIENT_ID,
//      GOOGLE_CLIENT_SECRET, and GOOGLE_REFRESH_TOKEN (Resend was
//      suspended, so this is the only fallback). A custom From only
//      works here if it's a verified "Send mail as" alias on that one
//      mailbox; otherwise Gmail rejects it and sendEmail() retries as
//      the default sender.

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

// Pull the bare mailbox out of a "Display Name <email>" header value — JWT
// impersonation's `subject` must be the bare address.
function bareEmail(addr: string): string {
  const m = addr.match(/<([^>]+)>/)
  return (m ? m[1] : addr).trim()
}

// Domain-wide-delegation Gmail client, impersonating `fromAddr`. Returns
// null (not a thrown error) when the service account isn't configured, so
// callers can just skip straight to the refresh-token transport.
function getImpersonatedGmail(fromAddr: string): gmail_v1.Gmail | null {
  const saKeyJson = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  const subject = bareEmail(fromAddr)
  if (!saKeyJson || !subject) return null
  try {
    const saKey = JSON.parse(saKeyJson)
    const auth = new google.auth.JWT({
      email: saKey.client_email,
      key: saKey.private_key,
      scopes: ['https://www.googleapis.com/auth/gmail.send'],
      subject,
    })
    return google.gmail({ version: 'v1', auth })
  } catch (e) {
    console.error('[email] Service account key parse failed:', e instanceof Error ? e.message : e)
    return null
  }
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

// Original hardcoded East/Greenhills-only map — kept as the last-resort
// fallback below (sync cache empty/unreachable, or a branch with no
// registry row at all), so behavior doesn't regress for those cases.
function hardcodedBranchFrom(branch?: string | null): string {
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

// Branch-specific From header for patient-facing reports (Initial Evaluation,
// Progress Report, Session Notes). Resolves from the synced HrBranch cache
// (see /api/branches/sync) — emailSessionNotes, falling back to emailHr,
// then emailMain — so a branch's sender is configured once in HR Platform's
// Branches Registry instead of hardcoded here. Falls back further to the
// original 2-branch hardcoded map if the branch has no registry row, the
// cache is empty, or the DB read fails — old behavior, not a hard failure.
// NOTE: for Gmail to accept a resolved address without domain-wide
// delegation configured, it must be a verified "Send mail as" alias on the
// authenticated (main@) mailbox — otherwise the send is retried from
// FROM_EMAIL by sendEmail() below.
export async function branchFromAddress(branch?: string | null): Promise<string> {
  // Opportunistically refresh the branch cache from HR Hub (throttled,
  // fire-and-forget) so a sender changed there propagates without a manual
  // "Sync Branches". This send uses the current cache; the next one gets any
  // update. Import lazily to avoid a module cycle (branch-sync → prisma only).
  void import('./branch-sync').then((m) => m.maybeSyncBranches()).catch(() => {})

  // Handle both branch representations: Patient.branch uses SANDBOX_EAST/
  // SANDBOX_GREENHILLS, while Staff.branch uses SBEA/SBGH.
  const normalized = branch === 'SBEA' ? 'SANDBOX_EAST' : branch === 'SBGH' ? 'SANDBOX_GREENHILLS' : branch
  if (normalized) {
    try {
      const hr = await prisma.hrBranch.findFirst({ where: { teletherapyBranch: normalized } })
      const resolved = hr?.emailSessionNotes || hr?.emailHr || hr?.emailMain
      if (resolved) return resolved
    } catch (e) {
      console.error('[email] HrBranch lookup failed, using hardcoded fallback:', e instanceof Error ? e.message : e)
    }
  }
  return hardcodedBranchFrom(branch)
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
  const send = async (fromAddr: string, gmail: gmail_v1.Gmail) => {
    const raw = buildRawMessage({ from: fromAddr, to, cc: ccList, subject, html, attachments, inlineImages })
    const res = await gmail.users.messages.send({ userId: 'me', requestBody: { raw } })
    return res.data
  }

  const primaryFrom = from ?? FROM_EMAIL

  // 1. Domain-wide delegation — impersonates primaryFrom directly, so a
  //    branch's resolved sender (or anything else on the domain) sends as
  //    itself with no "Send mail as" alias setup needed.
  const impersonated = getImpersonatedGmail(primaryFrom)
  if (impersonated) {
    try {
      return await send(primaryFrom, impersonated)
    } catch (err) {
      const e = err as { message?: string; code?: number }
      console.error('Delegated send as', primaryFrom, 'failed:', e?.code, e?.message, '— falling back to the refresh-token transport.')
      // Falls through to #2 below — expected until gmail.send is authorized
      // for domain-wide delegation, not an error.
    }
  }

  // 2. Refresh-token transport — the original, single-mailbox path.
  try {
    return await send(primaryFrom, getGmail())
  } catch (err) {
    const e = err as { message?: string; code?: number }
    // A branch From that isn't a verified send-as alias will be rejected by
    // Gmail. Don't let that stop the report reaching the patient — retry once
    // from the default mailbox.
    if (primaryFrom !== FROM_EMAIL) {
      console.error('Gmail send from', primaryFrom, 'failed:', e?.code, e?.message, '— retrying from default')
      try {
        return await send(FROM_EMAIL, getGmail())
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
