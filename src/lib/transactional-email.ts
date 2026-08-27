// Transactional email helper — sends via the Gmail API using the OAuth
// accounts already connected under Settings > Connected Accounts.
//
// History: this used nodemailer over SMTP (port 465), which the VPS blocks
// outbound, so it moved to the Resend HTTP API. It now uses the Gmail API,
// which is also plain HTTPS and so equally unaffected by that block — while
// removing the Resend subscription entirely.
//
// SENDER ACCOUNT — this deliberately does NOT reuse whichever account a bulk
// campaign happens to be using. Gmail's send quota is per account (~500/day
// on a regular account, ~2000 on Workspace) and a single campaign here can run
// to thousands of recipients across several days. If transactional mail shared
// that account, a large campaign would exhaust the quota and silently take
// down password resets and payment links. TRANSACTIONAL_GMAIL_ACCOUNT pins it
// to its own mailbox; keep that account out of campaign sends.

import { prisma } from '@/lib/prisma'
import { formatFromHeader } from '@/lib/email-headers'
import { getGmailClient } from '@/lib/email'

const DEFAULT_SENDER = 'main@sapphireclinicseast.org'
const FROM_NAME = 'Sapphire Clinics East'

export interface TransactionalAttachment {
  filename: string
  /** base64-encoded file contents */
  content: string
  /** defaults to application/octet-stream */
  contentType?: string
}

/**
 * Resolve which connected Gmail account sends the message.
 *
 * `preferAccount` lets a caller send from a specific mailbox — e.g. progress
 * reports go out from the patient's branch address. Because these are real
 * connected mailboxes, the mail genuinely originates there; the previous
 * Resend implementation could only set a From header and needed the root
 * domain SPF/DKIM-verified for it to be accepted at all. Falls back to the
 * default transactional account if that mailbox isn't connected.
 */
async function resolveSender(preferAccount?: string): Promise<{ refreshToken: string; email: string; displayName: string | null }> {
  const preferred = preferAccount || process.env.TRANSACTIONAL_GMAIL_ACCOUNT || DEFAULT_SENDER
  const acct =
    (await prisma.gmailAccount.findFirst({ where: { email: preferred } })) ??
    (await prisma.gmailAccount.findFirst({ where: { email: process.env.TRANSACTIONAL_GMAIL_ACCOUNT || DEFAULT_SENDER } })) ??
    (await prisma.gmailAccount.findFirst({ orderBy: { email: 'asc' } }))
  if (!acct) {
    throw new Error(
      'No connected Gmail account for transactional email. Connect one under Settings > Connected Accounts.',
    )
  }
  return { refreshToken: acct.refreshToken, email: acct.email, displayName: acct.displayName ?? null }
}

/** RFC 2047 encoded-word, so non-ASCII and emoji in the subject survive. */
function encodeSubject(subject: string): string {
  return `=?UTF-8?B?${Buffer.from(subject, 'utf-8').toString('base64')}?=`
}

/** Break base64 into 76-char lines (RFC 2045) — Gmail is strict about this. */
function wrap76(b64: string): string {
  return b64.replace(/(.{76})/g, '$1\r\n')
}

/**
 * Sends one transactional email through Gmail.
 *
 * Signature is unchanged from the Resend version (plus cc/attachments) so every
 * existing caller keeps working. Throws on failure — callers already treat a
 * throw as "email failed".
 */
export async function sendTransactionalEmail(params: {
  to: string
  subject: string
  html: string
  text?: string
  cc?: string[]
  attachments?: TransactionalAttachment[]
  /** Send from this connected mailbox if available (e.g. the branch address). */
  fromAccount?: string
}): Promise<void> {
  const { to, subject, html, cc, attachments, fromAccount } = params
  const { refreshToken, email: from, displayName } = await resolveSender(fromAccount)
  const gmail = await getGmailClient(refreshToken)

  const headers = [
    `From: ${formatFromHeader(displayName || FROM_NAME, from)}`,
    `To: ${to}`,
    ...(cc && cc.length > 0 ? [`Cc: ${cc.join(', ')}`] : []),
    `Subject: ${encodeSubject(subject)}`,
    'MIME-Version: 1.0',
  ]

  let message: string
  if (attachments && attachments.length > 0) {
    // multipart/mixed — body part first, then each attachment.
    const boundary = `b${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`
    const parts = [
      `--${boundary}`,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(Buffer.from(html, 'utf-8').toString('base64')),
    ]
    for (const a of attachments) {
      parts.push(
        `--${boundary}`,
        `Content-Type: ${a.contentType ?? 'application/octet-stream'}; name="${a.filename}"`,
        `Content-Disposition: attachment; filename="${a.filename}"`,
        'Content-Transfer-Encoding: base64',
        '',
        wrap76(a.content),
      )
    }
    parts.push(`--${boundary}--`)
    message = [
      ...headers,
      `Content-Type: multipart/mixed; boundary="${boundary}"`,
      '',
      ...parts,
    ].join('\r\n')
  } else {
    message = [
      ...headers,
      'Content-Type: text/html; charset=utf-8',
      'Content-Transfer-Encoding: base64',
      '',
      wrap76(Buffer.from(html, 'utf-8').toString('base64')),
    ].join('\r\n')
  }

  await gmail.users.messages.send({
    userId: 'me',
    requestBody: { raw: Buffer.from(message).toString('base64url') },
  })
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
