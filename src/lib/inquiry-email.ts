// Emailing an enquirer their conversation link.
//
// Why this exists: the private link is the only way back into a conversation.
// A returning enquirer who has lost it can still reach the right thread — their
// message joins it, because we match on their contact details — but they cannot
// SEE it, so the clinic's reply goes unread.
//
// Revealing the thread to anyone who types an email was the alternative, and it
// is not acceptable here: email addresses are known and guessable, and these
// threads carry what a parent has said about their child. Emailing the link
// instead proves the person controls the address before anything is disclosed.
//
// Sending is best-effort. A failed email must never fail the enquiry — the
// message itself is already saved, and losing it because Gmail was briefly
// unreachable would be a far worse outcome than a missing notification.

import { prisma } from '@/lib/prisma'
import { sendTransactionalEmail } from '@/lib/transactional-email'

const BRANCH_NAME: Record<string, string> = {
  SBEA: 'Aura Health Rehab – East',
  SBGH: 'Aura Health Rehab – Greenhills',
}

function publicBase(): string {
  return process.env.PUBLIC_HUB_URL
    ?? process.env.NEXTAUTH_URL
    ?? 'https://operations.sapphireclinicseast.org'
}

/** The branch's own mailbox, so a reply comes from the clinic the person wrote to. */
async function branchSender(branch: string): Promise<string | undefined> {
  const row = await prisma.hrBranch.findFirst({
    where: { shortCode: branch },
    select: { emailMain: true, emailHr: true },
  }).catch(() => null)
  return row?.emailMain || row?.emailHr || undefined
}

function shell(branchName: string, heading: string, lead: string, ref: string, url: string, cta: string) {
  return `
  <div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;max-width:520px;margin:0 auto;padding:8px">
    <div style="background:#1a7b8a;color:#fff;padding:18px 22px;border-radius:12px 12px 0 0">
      <p style="margin:0;font-size:16px;font-weight:700">${branchName}</p>
    </div>
    <div style="border:1px solid #e3e8ea;border-top:0;border-radius:0 0 12px 12px;padding:22px">
      <p style="margin:0 0 10px;font-size:17px;font-weight:700;color:#24505a">${heading}</p>
      <p style="margin:0 0 16px;font-size:14px;line-height:1.6;color:#4b5a5f">${lead}</p>
      <p style="margin:0 0 6px;font-size:12px;color:#8a9499">Your reference</p>
      <p style="margin:0 0 18px;font-size:19px;font-weight:700;color:#1a7b8a;letter-spacing:0.02em">${ref}</p>
      <a href="${url}" style="display:inline-block;background:#1a7b8a;color:#fff;text-decoration:none;padding:12px 20px;border-radius:9px;font-size:14px;font-weight:700">${cta}</a>
      <p style="margin:18px 0 0;font-size:12px;line-height:1.6;color:#8a9499">
        This link is private to you — please don't forward it. It is the only way
        to open this conversation, so keep this email if you'd like to come back to it.
      </p>
    </div>
  </div>`
}

/**
 * Send the enquirer their link.
 *
 * `reason` only changes the wording: 'new' for a conversation just started,
 * 'continued' when a fresh message joined one they already had — which is the
 * case this was built for, since that is when they may no longer have the link.
 */
export async function emailInquiryLink(
  inquiryId: string,
  reason: 'new' | 'continued' | 'reply',
): Promise<void> {
  try {
    const inq = await prisma.inquiry.findUnique({
      where: { id: inquiryId },
      select: { ref: true, token: true, branch: true, email: true, name: true },
    })
    if (!inq?.email) return          // nothing to send to — phone-only enquirer

    const branchName = BRANCH_NAME[inq.branch] ?? 'Aura Health Rehab'
    const url = `${publicBase()}/inquiry/${inq.ref}?t=${inq.token}`
    const first = (inq.name || '').trim().split(/\s+/)[0] || 'there'

    const copy = reason === 'reply'
      ? {
          subject: `${branchName} replied — ${inq.ref}`,
          heading: 'We’ve replied to your message',
          lead: `Hi ${first}, ${branchName} has answered your enquiry. Open the conversation to read it and reply.`,
          cta: 'Read the reply',
        }
      : reason === 'continued'
      ? {
          subject: `Your message was added — ${inq.ref}`,
          heading: 'Your message has been added',
          lead: `Hi ${first}, we’ve added your message to the conversation you already had with ${branchName}, so everything stays in one place. Open it any time to see the full history.`,
          cta: 'Open my conversation',
        }
      : {
          subject: `We’ve got your enquiry — ${inq.ref}`,
          heading: 'Thanks for getting in touch',
          lead: `Hi ${first}, ${branchName} has received your enquiry and will reply in this conversation.`,
          cta: 'Open my conversation',
        }

    await sendTransactionalEmail({
      to: inq.email,
      subject: copy.subject,
      html: shell(branchName, copy.heading, copy.lead, inq.ref, url, copy.cta),
      text: `${copy.heading}\n\n${copy.lead}\n\nReference: ${inq.ref}\n${url}\n\nThis link is private to you — please don't forward it.`,
      fromAccount: await branchSender(inq.branch),
    })
  } catch (err) {
    // Logged, never thrown. Visible in `docker logs sapphire_app`.
    console.error('[inquiry-email] could not send link for', inquiryId, err)
  }
}
