import { prisma } from './prisma'
import { getGmailClient } from './email'

/**
 * Harvest delivery-failure reports from the sending mailboxes.
 *
 * Gmail's API tells us a message was ACCEPTED for delivery, never that it
 * arrived. A failure comes back minutes later as a separate message from
 * mailer-daemon addressed to the sending mailbox, so the only way to learn
 * which addresses are dead is to read those mailboxes back.
 *
 * Only HARD bounces unsubscribe anyone. A hard bounce means the address does
 * not exist (5.1.1, "user unknown"); a soft bounce means a full mailbox or
 * throttling, which clears on its own. Unsubscribing on a soft bounce would
 * quietly cut a real patient off from clinic mail because their inbox was full
 * one afternoon — so soft bounces are recorded and otherwise ignored.
 */

// Enhanced status codes (RFC 3463). 5.x.x is "permanent" and 4.x.x transient,
// but the class alone is the wrong test for unsubscribing. Only 5.1.x means the
// ADDRESS DOES NOT EXIST — which is the one thing that justifies removing a
// patient from the list.
//
// The trap is 5.2.2 (mailbox full). It is a 5.x.x permanent failure, yet the
// address is perfectly real and belongs to a patient whose inbox filled up.
// Treating it as hard would silently cut off a live patient, so anything
// outside 5.1.x is recorded as SOFT no matter how permanent the class claims
// to be. Same for 5.7.x (policy/blocked) — the mailbox exists, something else
// refused the message.
const STATUS_RE = /\b([45]\.\d{1,3}\.\d{1,3})\b/
const ADDRESS_DOES_NOT_EXIST = /^5\.1\.[0-9]+$/

// Phrases seen in real Google/Postfix reports where no status code is present.
const HARD_PHRASES = [
  'address not found',
  'user unknown',
  'no such user',
  'recipient address rejected',
  'does not exist',
  'unrouteable address',
  'mailbox unavailable',
  'account that you tried to reach does not exist',
]
const SOFT_PHRASES = [
  'quota',
  'mailbox full',
  'over quota',
  'try again later',
  'temporarily',
  'rate limited',
  'too many',
]

export type BounceKind = 'HARD' | 'SOFT'

/**
 * Classify a failure report. The status code wins when present — it is the
 * machine-readable field the sending server actually set. Phrases are only a
 * fallback, and an unrecognised report is treated as SOFT: over-classifying as
 * HARD would unsubscribe a real patient, which is the expensive mistake here.
 */
export function classifyBounce(text: string): { kind: BounceKind; statusCode: string | null } {
  const lower = text.toLowerCase()
  const code = text.match(STATUS_RE)?.[1] ?? null

  if (code) return { kind: ADDRESS_DOES_NOT_EXIST.test(code) ? 'HARD' : 'SOFT', statusCode: code }
  if (SOFT_PHRASES.some(p => lower.includes(p))) return { kind: 'SOFT', statusCode: null }
  if (HARD_PHRASES.some(p => lower.includes(p))) return { kind: 'HARD', statusCode: null }
  return { kind: 'SOFT', statusCode: null }
}

/**
 * Pull the failed recipient out of a report. `X-Failed-Recipients` is the
 * reliable source when present; otherwise fall back to the first address in the
 * body that is not the daemon itself or one of our own mailboxes — quoting the
 * original message means our own From: line usually appears too.
 */
export function extractFailedRecipient(headers: Record<string, string>, body: string, ownAddresses: string[]): string | null {
  const explicit = headers['x-failed-recipients']
  if (explicit) return explicit.split(',')[0].trim().toLowerCase()

  const own = new Set(ownAddresses.map(a => a.toLowerCase()))
  const candidates = body.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []
  for (const raw of candidates) {
    const addr = raw.toLowerCase().replace(/[.,;)]+$/, '')
    if (own.has(addr)) continue
    if (/mailer-daemon|postmaster|googlemail\.com|google\.com/.test(addr)) continue
    return addr
  }
  return null
}

function headerMap(payloadHeaders: { name?: string | null; value?: string | null }[] | undefined) {
  const out: Record<string, string> = {}
  for (const h of payloadHeaders ?? []) {
    if (h.name) out[h.name.toLowerCase()] = h.value ?? ''
  }
  return out
}

/** Walk the MIME tree and concatenate every text part. */
function collectText(part: any): string {
  if (!part) return ''
  let out = ''
  if (part.body?.data) {
    try { out += Buffer.from(part.body.data, 'base64url').toString('utf-8') } catch { /* skip */ }
  }
  for (const p of part.parts ?? []) out += '\n' + collectText(p)
  return out
}

export interface ScanResult {
  mailbox: string
  reportsSeen: number
  newBounces: number
  hard: number
  soft: number
  unsubscribed: number
  errors: string[]
}

/**
 * Scan one mailbox for failure reports newer than `afterDays`.
 *
 * `dryRun` records nothing and unsubscribes nobody — the first run over a
 * mailbox with years of history should be inspected before it is allowed to
 * act on ~thousands of old reports.
 */
export async function scanMailboxForBounces(opts: {
  email: string
  refreshToken: string
  ownAddresses: string[]
  afterDays?: number
  maxMessages?: number
  dryRun?: boolean
}): Promise<ScanResult> {
  const { email, refreshToken, ownAddresses, afterDays = 90, maxMessages = 500, dryRun = false } = opts
  const result: ScanResult = { mailbox: email, reportsSeen: 0, newBounces: 0, hard: 0, soft: 0, unsubscribed: 0, errors: [] }

  const gmail = await getGmailClient(refreshToken)

  // Both senders appear in the wild: Gmail uses mailer-daemon@googlemail.com,
  // relayed hosts often use postmaster@.
  const query = `(from:mailer-daemon OR from:postmaster) newer_than:${afterDays}d`

  let pageToken: string | undefined
  const ids: string[] = []
  while (ids.length < maxMessages) {
    const list = await gmail.users.messages.list({
      userId: 'me', q: query, maxResults: Math.min(100, maxMessages - ids.length), pageToken,
    })
    for (const m of list.data.messages ?? []) if (m.id) ids.push(m.id)
    pageToken = list.data.nextPageToken ?? undefined
    if (!pageToken) break
  }
  result.reportsSeen = ids.length
  if (ids.length === 0) return result

  // Skip anything already recorded so a rescan costs one query, not N fetches.
  const known = new Set(
    (await prisma.emailBounce.findMany({ where: { gmailMsgId: { in: ids } }, select: { gmailMsgId: true } }))
      .map(b => b.gmailMsgId),
  )

  for (const id of ids) {
    if (known.has(id)) continue
    try {
      const msg = await gmail.users.messages.get({ userId: 'me', id, format: 'full' })
      const headers = headerMap(msg.data.payload?.headers ?? undefined)
      const body = collectText(msg.data.payload) || msg.data.snippet || ''
      const recipient = extractFailedRecipient(headers, body, ownAddresses)
      if (!recipient) continue

      const { kind, statusCode } = classifyBounce(body)
      const reason = (msg.data.snippet ?? '').slice(0, 300) || null

      if (kind === 'HARD') result.hard++; else result.soft++
      if (dryRun) { result.newBounces++; continue }

      const patient = await prisma.patient.findFirst({
        where: { email: { equals: recipient, mode: 'insensitive' } },
        select: { id: true, unsubscribed: true },
      })

      // Only a HARD bounce takes someone off the list.
      const shouldUnsub = kind === 'HARD' && !!patient && !patient.unsubscribed
      if (shouldUnsub) {
        await prisma.patient.update({ where: { id: patient!.id }, data: { unsubscribed: true } })
        result.unsubscribed++
      }

      await prisma.emailBounce.create({
        data: {
          email: recipient,
          patientId: patient?.id ?? null,
          kind,
          statusCode,
          reason,
          gmailMsgId: id,
          mailbox: email,
          unsubscribed: shouldUnsub,
        },
      })
      result.newBounces++
    } catch (err) {
      result.errors.push(`${id}: ${err instanceof Error ? err.message : 'unknown'}`)
    }
  }

  return result
}

/** Scan every connected Gmail account. */
export async function scanAllMailboxes(opts: { afterDays?: number; maxMessages?: number; dryRun?: boolean } = {}) {
  const accounts = await prisma.gmailAccount.findMany({ select: { email: true, refreshToken: true } })
  const ownAddresses = accounts.map(a => a.email)
  const results: ScanResult[] = []
  for (const a of accounts) {
    try {
      results.push(await scanMailboxForBounces({ ...opts, email: a.email, refreshToken: a.refreshToken, ownAddresses }))
    } catch (err) {
      results.push({
        mailbox: a.email, reportsSeen: 0, newBounces: 0, hard: 0, soft: 0, unsubscribed: 0,
        errors: [err instanceof Error ? err.message : 'unknown'],
      })
    }
  }
  return results
}
