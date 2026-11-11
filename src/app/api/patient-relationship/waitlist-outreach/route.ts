// POST /api/patient-relationship/waitlist-outreach
//
// Tells one family on the intake waitlist that slots have opened, by email or
// by SMS, from their own branch's mailbox and phone. Every send is logged so
// the icon can stay green and the row can show when it went out.
//
// The browser sends { formId, submissionId, channel } and NOTHING else. The
// recipient and the words are built here from the submission re-read out of HR
// Platform. A route that took an address and a body from the client would be a
// way to send arbitrary mail from the clinic's own mailbox, to anyone.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { getGmailClient } from '@/lib/email'
import { encodeHeaderWord, formatFromHeader } from '@/lib/email-headers'
import { getBranchNotifyConfig, getBranchSender, type BranchNotifyConfig } from '@/lib/branch-notify-config'
import { hrFetch, serviceLabelsFrom, waitlistSources, SERVICE_QUESTION } from '@/lib/waitlist-source'
import {
  buildOutreachEmail, buildOutreachSms, contactFrom, type OutreachChannel,
} from '@/lib/waitlist-outreach'

export const maxDuration = 30

// Same gateway and numbers as the follow-up SMS — one phone per branch, the
// one families already have in their contacts.
const SMS_CONFIG: Record<string, { httpSmsKey: string; phone: string }> = {
  SBEA: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBEA ?? '', phone: '+639171189289' },
  SBGH: { httpSmsKey: process.env.HTTPSMS_API_KEY_SBGH ?? '', phone: '+639177701686' },
}

function toE164(phone: string): string {
  const digits = phone.replace(/\D/g, '')
  if (digits.startsWith('63') && digits.length >= 11) return '+' + digits
  if (digits.startsWith('0') && digits.length === 11) return '+63' + digits.slice(1)
  if (digits.length === 10) return '+63' + digits
  return '+' + digits
}

/** A plausible address, so a typo in a form field fails here rather than at Gmail. */
const looksLikeEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s)

function makeRawEmail(opts: {
  to: string; from: string; fromName: string; subject: string; html: string; text: string
}): string {
  const boundary = 'sb_waitlist_' + Date.now()
  const message = [
    `From: ${formatFromHeader(opts.fromName, opts.from)}`,
    `To: ${opts.to}`,
    `Subject: ${encodeHeaderWord(opts.subject)}`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    opts.text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset=utf-8',
    '',
    opts.html,
    '',
    `--${boundary}--`,
  ].join('\n')
  return Buffer.from(message).toString('base64url')
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const sentByName = (session.user as { name?: string } | undefined)?.name ?? null

  const body = await req.json().catch(() => ({}))
  const formId = String(body.formId ?? '')
  const submissionId = String(body.submissionId ?? '')
  const channel: OutreachChannel = body.channel === 'SMS' ? 'SMS' : 'EMAIL'
  // `confirmResend` is the browser saying the person was shown when this last
  // went out and chose to send it again.
  const confirmResend = body.confirmResend === true

  if (!formId || !submissionId) {
    return NextResponse.json({ error: 'formId and submissionId are required' }, { status: 400 })
  }

  // The form id has to be one of ours. Without this the route would relay a
  // message built from any form in HR Platform that the service key can read.
  const source = waitlistSources('all').find(s => s.formId === formId)
  if (!source) return NextResponse.json({ error: 'Unknown waitlist form' }, { status: 400 })
  const branch = source.branch

  // ── Already sent? ─────────────────────────────────────────────────────────
  // Not a hard block: slots open again and the same family may legitimately be
  // told twice. But a second send has to be deliberate, because the first
  // click is often a double click.
  const prior = await prisma.waitlistOutreach.findFirst({
    where: { formId, submissionId, channel },
    orderBy: { sentAt: 'desc' },
  })
  if (prior && !confirmResend) {
    return NextResponse.json({
      needsConfirm: true,
      lastSentAt: prior.sentAt,
      lastSentTo: prior.sentTo,
      lastSentByName: prior.sentByName,
    }, { status: 409 })
  }

  // ── Re-read the submission from HR ────────────────────────────────────────
  let item: Record<string, unknown> | undefined
  let fields: Array<Record<string, unknown>> = []
  try {
    const res = await hrFetch(`/forms/external/${formId}/responses`, { cache: 'no-store' })
    const d = await res.json()
    if (!d?.ok || !Array.isArray(d.items)) throw new Error('HR returned no items')
    fields = Array.isArray(d.fields) ? d.fields : []
    item = d.items.find((i: { landing_id?: string }) => i?.landing_id === submissionId)
  } catch (err) {
    return NextResponse.json(
      { error: `Could not read the waitlist entry from HR Platform (${(err as Error).message})` },
      { status: 502 },
    )
  }
  if (!item) return NextResponse.json({ error: 'That waitlist entry no longer exists' }, { status: 404 })

  const titles = new Map<string, string>(
    fields.filter(f => f?.id).map(f => [String(f.id), String(f.title ?? '').toLowerCase()]),
  )
  const contact = contactFrom(item, titles)

  // The services question, resolved with the list's own matcher rather than a
  // copy of it — a second regex here would drift, and the email would then
  // name different services from the column front desk read before clicking.
  const serviceFieldId = fields.find(
    f => f?.type === 'multiple_choice' && SERVICE_QUESTION.test(String(f?.title ?? '')),
  )?.id
  const answer = serviceFieldId
    ? (item.answers as Array<Record<string, unknown>> | undefined)?.find(
        a => (a.field as { id?: string } | undefined)?.id === serviceFieldId)
    : undefined
  const services = serviceLabelsFrom(answer)

  const cfg: BranchNotifyConfig = await getBranchNotifyConfig(branch)

  // ── Send ──────────────────────────────────────────────────────────────────
  let sentTo = ''
  let subject: string | null = null
  let message = ''

  if (channel === 'EMAIL') {
    if (!contact.email) {
      return NextResponse.json({ error: 'That form has no email address on it' }, { status: 400 })
    }
    if (!looksLikeEmail(contact.email)) {
      return NextResponse.json(
        { error: `"${contact.email}" does not look like an email address — correct it in HR Platform first` },
        { status: 400 },
      )
    }
    const built = buildOutreachEmail({ contact, services, cfg })
    const sender = await getBranchSender(cfg)
    if (!sender) {
      return NextResponse.json({
        error: `No mailbox is connected for ${cfg.branchName}. Connect ${cfg.ccEmail} under Settings → Email.`,
      }, { status: 503 })
    }
    // Deliberately a hard stop rather than the warn-and-send the schedule
    // reminders do: this message says "your branch has slots", and arriving
    // from a different branch's mailbox makes it unanswerable.
    if (!sender.isBranchMailbox) {
      return NextResponse.json({
        error: `${cfg.ccEmail} is not connected, so this would be sent from ${sender.email} instead. Connect it under Settings → Email.`,
      }, { status: 503 })
    }

    try {
      const gmail = await getGmailClient(sender.refreshToken)
      await gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw: makeRawEmail({
            to: contact.email,
            from: sender.email,
            fromName: cfg.brandName,
            subject: built.subject,
            html: built.html,
            text: built.text,
          }),
        },
      })
    } catch (err) {
      return NextResponse.json({ error: `Gmail refused the message: ${(err as Error).message}` }, { status: 502 })
    }

    sentTo = contact.email
    subject = built.subject
    message = built.text
  } else {
    if (!contact.phone) {
      return NextResponse.json({ error: 'That form has no mobile number on it' }, { status: 400 })
    }
    const sms = SMS_CONFIG[branch]
    if (!sms?.httpSmsKey) {
      return NextResponse.json({ error: `SMS is not configured for ${cfg.branchName}` }, { status: 503 })
    }
    const text = buildOutreachSms({ contact, services, cfg })
    const to = toE164(contact.phone)

    let res: Response
    try {
      res = await fetch('https://api.httpsms.com/v1/messages/send', {
        method: 'POST',
        headers: { 'x-api-key': sms.httpSmsKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: text,
          from: sms.phone,
          to,
          expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        }),
        signal: AbortSignal.timeout(10_000),
      })
    } catch (err) {
      return NextResponse.json(
        { error: `Could not reach the SMS gateway (${(err as Error).message})` }, { status: 502 })
    }
    if (!res.ok) {
      return NextResponse.json({ error: `SMS gateway error ${res.status}` }, { status: 502 })
    }

    sentTo = to
    message = text
  }

  // Logged only after the send succeeded — a row here is a claim that the
  // family was told, and a green icon over a message that never left would be
  // worse than no icon.
  const row = await prisma.waitlistOutreach.create({
    data: { formId, submissionId, channel, branch, sentTo, subject, message, sentByName },
  })

  return NextResponse.json({
    ok: true, channel, sentAt: row.sentAt, sentTo, subject, message,
    resent: !!prior,
  })
}

// GET ?formId=&submissionId= — the row's own history, for the expanded view.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const formId = searchParams.get('formId') ?? ''
  const submissionId = searchParams.get('submissionId') ?? ''
  if (!formId || !submissionId) {
    return NextResponse.json({ error: 'formId and submissionId are required' }, { status: 400 })
  }

  const rows = await prisma.waitlistOutreach.findMany({
    where: { formId, submissionId },
    orderBy: { sentAt: 'desc' },
    select: { id: true, channel: true, sentTo: true, subject: true, message: true, sentByName: true, sentAt: true },
  })
  return NextResponse.json({ sends: rows })
}
