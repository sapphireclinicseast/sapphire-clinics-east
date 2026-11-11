/**
 * "Good news — we have slots" messages for people on the intake waitlist.
 *
 * The waitlist is HR form submissions, not patients, so everything here is
 * keyed to (formId, submissionId) and the contact details come out of the form
 * answers rather than a Patient row.
 *
 * Both the email and the SMS are built HERE, server-side, from the submission
 * the server re-reads from HR. The browser sends an id and nothing else: a
 * route that accepted message text from the client would be a way to send
 * arbitrary mail from the clinic's own mailbox to an arbitrary address.
 */

import { prisma } from '@/lib/prisma'
import { waitlistSources } from '@/lib/waitlist-source'
import type { BranchNotifyConfig } from '@/lib/branch-notify-config'

export type OutreachChannel = 'EMAIL' | 'SMS'

/** What the form recorded about how to reach this family. */
export interface WaitlistContact {
  firstName: string
  lastName: string
  email: string
  phone: string
}

/**
 * Name, email and phone out of one HR form submission.
 *
 * Forms differ: some ask with a single contact_info field, some with separate
 * text questions. Both shapes are read, the structured one first. This mirrors
 * what the conversion dialog already does in the client — moved here so the
 * message and the dialog cannot disagree about who is being written to.
 */
export function contactFrom(item: { answers?: unknown }, titles?: Map<string, string>): WaitlistContact {
  const answers: Array<Record<string, unknown>> = Array.isArray(item?.answers)
    ? (item.answers as Array<Record<string, unknown>>) : []
  let firstName = '', lastName = '', email = '', phone = ''

  const contactField = answers.find(a => {
    const f = a.field as { type?: string } | undefined
    return f?.type === 'contact_info' || !!a.contact
  })
  const c = contactField?.contact as Record<string, string> | undefined
  if (c) {
    firstName = c.first_name || ''
    lastName  = c.last_name  || ''
    email     = c.email        || ''
    phone     = c.phone_number || ''
  }

  for (const a of answers) {
    const id = (a.field as { id?: string } | undefined)?.id ?? ''
    const t = (titles?.get(id) ?? '').toLowerCase()
    const text = typeof a.text === 'string' ? a.text : ''
    if (!email && (a.email || t.includes('email'))) email = String(a.email || text || '')
    if (!phone && (a.phone_number || t.includes('phone') || t.includes('mobile'))) {
      phone = String(a.phone_number || text || '')
    }
  }

  return {
    firstName: firstName.trim(),
    lastName: lastName.trim(),
    email: email.trim(),
    phone: phone.trim(),
  }
}

/** "Occupational Therapy and Speech Therapy", "OT, PT and SLP". */
export function listServices(services: string[]): string {
  const clean = services.map(s => s.trim()).filter(Boolean)
  if (clean.length === 0) return ''
  if (clean.length === 1) return clean[0]
  return `${clean.slice(0, -1).join(', ')} and ${clean[clean.length - 1]}`
}

/** How we address them when the form gave us no name. */
const greeting = (firstName: string) => (firstName ? `Hi ${firstName}'s family,` : 'Hello,')

export const OUTREACH_SUBJECT = 'Good news! We have slots available at Aura Health Rehab!'

/**
 * The email.
 *
 * Warm, short, and specific about what they asked for — a family who ticked
 * Speech Therapy six weeks ago should not have to work out whether this is
 * about them. No date or time is promised: the slots move, and front desk book
 * the actual schedule in the reply.
 */
export function buildOutreachEmail(
  { contact, services, cfg }: { contact: WaitlistContact; services: string[]; cfg: BranchNotifyConfig },
): { subject: string; text: string; html: string } {
  const asked = listServices(services)
  const forWhat = asked
    ? `the ${asked} sessions you enquired about`
    : 'the services you enquired about'

  const lines = [
    greeting(contact.firstName),
    '',
    `Thank you for your patience — we know waiting is the hard part.`,
    '',
    `We're happy to let you know that slots have opened up at ${cfg.brandName} for ${forWhat}.`,
    '',
    `If you would still like to proceed, simply reply to this email or call us at ${cfg.phone}, and we'll find a schedule that works for your family. We'd be glad to walk you through what the first session looks like if it would help.`,
    '',
    `Warmly,`,
    cfg.teamName,
    cfg.location,
    cfg.phone,
  ]

  const esc = (s: string) => s
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  const html = `<!doctype html><html><body style="margin:0;padding:0;background:#F6F8F7;">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;font-size:15px;line-height:1.65;color:#243B53;">
    <p style="margin:0 0 16px;">${esc(greeting(contact.firstName))}</p>
    <p style="margin:0 0 16px;">Thank you for your patience — we know waiting is the hard part.</p>
    <p style="margin:0 0 16px;">We're happy to let you know that <strong>slots have opened up</strong> at ${esc(cfg.brandName)} for ${esc(forWhat)}.</p>
    ${services.length ? `<p style="margin:0 0 16px;padding:12px 16px;background:#EDF5F2;border-radius:10px;">
      <span style="font-size:12px;text-transform:uppercase;letter-spacing:.04em;color:#5C7A72;">What you asked about</span><br>
      <strong style="color:#1F3A5F;">${esc(asked)}</strong>
    </p>` : ''}
    <p style="margin:0 0 16px;">If you would still like to proceed, simply reply to this email or call us at ${esc(cfg.phone)}, and we'll find a schedule that works for your family. We'd be glad to walk you through what the first session looks like if it would help.</p>
    <p style="margin:0 0 4px;">Warmly,</p>
    <p style="margin:0 0 16px;"><strong>${esc(cfg.teamName)}</strong></p>
    <p style="margin:0;font-size:12px;color:#5C7A72;">${esc(cfg.location)}<br>${esc(cfg.phone)}</p>
  </div></body></html>`

  return { subject: OUTREACH_SUBJECT, text: lines.join('\n'), html }
}

/**
 * The SMS.
 *
 * One message where it can be. A phone shows the sender's number, so the
 * branch names itself in the text rather than relying on the header, and the
 * services are named only when they still fit.
 */
export function buildOutreachSms(
  { contact, services, cfg }: { contact: WaitlistContact; services: string[]; cfg: BranchNotifyConfig },
): string {
  const who = contact.firstName ? `Hi ${contact.firstName}'s family!` : 'Hello!'
  const asked = listServices(services)
  const head = `${who} Good news from Aura Health Rehab ${cfg.brandShort} — we now have slots available`
  const tail = `. Reply or call ${cfg.phone.split('|')[0].trim()} and we'll find a schedule that suits you. We'd love to see you!`

  const withServices = `${head} for ${asked}${tail}`
  // 320 is two segments. Past that the services come out rather than letting
  // the message run to three — the point is to get them to reply, and the
  // detail is in the email.
  if (asked && withServices.length <= 320) return withServices
  return `${head}${tail}`
}

/** One channel's sending history for one submission. */
export interface OutreachState {
  count: number
  lastAt: string
  lastBy: string | null
  history: { sentAt: string; sentTo: string; sentByName: string | null }[]
}

/**
 * Stamp what has already been sent onto the responses, in place.
 *
 * One query however long the waitlist grows, like attachWaitlistFollowUps. A
 * failure leaves the rows unstamped rather than failing the caller: the
 * submissions are the point. The cost of that is an icon that reads unsent
 * when it is not, so the send route checks the log again before sending and
 * tells front desk when it last went out.
 */
export async function attachWaitlistOutreach(
  responses: Array<Record<string, unknown>>, formKey: string,
): Promise<void> {
  try {
    const formIds = waitlistSources(formKey).map(s => s.formId)
    const rows = await prisma.waitlistOutreach.findMany({
      where: { formId: { in: formIds } },
      orderBy: { sentAt: 'asc' },
      select: { formId: true, submissionId: true, channel: true, sentAt: true, sentTo: true, sentByName: true },
    })

    const byKey = new Map<string, { EMAIL: OutreachState | null; SMS: OutreachState | null }>()
    for (const r of rows) {
      const key = `${r.formId}|${r.submissionId}`
      const entry = byKey.get(key) ?? { EMAIL: null, SMS: null }
      const channel = r.channel === 'SMS' ? 'SMS' : 'EMAIL'
      const state = entry[channel] ?? { count: 0, lastAt: '', lastBy: null, history: [] }
      state.count += 1
      state.lastAt = r.sentAt.toISOString()
      state.lastBy = r.sentByName
      state.history.push({ sentAt: r.sentAt.toISOString(), sentTo: r.sentTo, sentByName: r.sentByName })
      entry[channel] = state
      byKey.set(key, entry)
    }

    for (const item of responses) {
      const found = byKey.get(`${item._formId}|${item.landing_id}`)
      if (found) item._outreach = found
    }
  } catch (err) {
    console.error('[waitlist] outreach lookup failed:', err)
  }
}
