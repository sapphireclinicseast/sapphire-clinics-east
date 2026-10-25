// Enquiry reference numbers: YYYY-MM-DD-00001, counting from 1 each day.
//
// The sequence is per calendar day and shared across branches, so the ref an
// enquirer quotes is unique on its own and front desk can search for it without
// knowing which branch took it.
//
// Allocation is racy by nature — two people can submit the same second — so
// this does NOT read a count and trust it. It reads the highest ref used today,
// tries the next one, and lets the database's unique index settle any tie: on a
// collision it simply tries again. That is why `ref` is `@unique` rather than
// merely indexed; the constraint is the mechanism, not a safety net.

import { prisma } from '@/lib/prisma'
import { randomBytes } from 'crypto'

/** Manila is UTC+8 and the clinic's day is what front desk means by "today". */
export function manilaDateKey(d: Date = new Date()): string {
  const manila = new Date(d.getTime() + 8 * 60 * 60 * 1000)
  return manila.toISOString().slice(0, 10)      // YYYY-MM-DD
}

/** Unguessable secret for the enquirer's link. */
export function newInquiryToken(): string {
  return randomBytes(24).toString('base64url')
}

/**
 * Next free ref for today, as a candidate. Callers must be ready for the insert
 * to fail on the unique index and ask again — see createInquiryWithRef.
 */
async function nextRefCandidate(dayKey: string): Promise<string> {
  const latest = await prisma.inquiry.findFirst({
    where: { ref: { startsWith: `${dayKey}-` } },
    orderBy: { ref: 'desc' },
    select: { ref: true },
  })
  const n = latest ? Number(latest.ref.slice(-5)) + 1 : 1
  // Five digits is 99,999 enquiries in one day. If that is ever exceeded the
  // number simply grows a digit rather than wrapping and colliding forever.
  return `${dayKey}-${String(n).padStart(5, '0')}`
}

export interface NewInquiryInput {
  branch: string
  name: string
  email?: string | null
  phone?: string | null
  subject?: string | null
  body: string
  /** Set when the enquiry came from a signed-in portal session. Trusted — the
   *  caller has already verified the patient token. */
  patientId?: string | null
}

/**
 * Who is this, if we already know them?
 *
 * Contact details only — email or phone. Deliberately NOT the name fallback the
 * staff contact panel uses: that one is a hint shown to a human who can judge
 * it, whereas this one decides whose portal a conversation appears in. Guessing
 * by name there would put one family's enquiry in another's account.
 */
async function resolvePatientId(email?: string | null, phone?: string | null): Promise<string | null> {
  const digits = (phone ?? '').replace(/[^0-9]/g, '')
  if (!email && digits.length < 10) return null
  const p = await prisma.patient.findFirst({
    where: {
      OR: [
        ...(email ? [{ email: { equals: email, mode: 'insensitive' as const } }] : []),
        ...(digits.length >= 10 ? [{ phone: { endsWith: digits.slice(-10) } }] : []),
      ],
    },
    select: { id: true },
  })
  return p?.id ?? null
}

/**
 * Create an enquiry and its first message atomically, retrying on a ref clash.
 *
 * Both rows go in one transaction: an enquiry with no message would show in the
 * inbox as an empty thread, which reads as a bug rather than as the partial
 * write it is.
 */
export async function createInquiryWithRef(input: NewInquiryInput) {
  // ── Continue an existing conversation where we can ────────────────────────
  // Without this every visit opened a new reference, so one parent asking three
  // questions over a week became three unrelated threads and front desk had no
  // way to see they were the same person. Matching on contact details keeps the
  // trail in one place.
  //
  // Scoped to the same branch: messaging East and messaging Greenhills are two
  // conversations with two different desks, not one.
  //
  // A CLOSED thread is deliberately NOT reused — closing it is the desk saying
  // the matter is finished, and reopening it silently would undo that. A new
  // reference is opened instead, and the contact panel shows the earlier ones.
  const digits = (input.phone ?? '').replace(/[^0-9]/g, '')
  const patientId = input.patientId ?? await resolvePatientId(input.email, input.phone)

  // Match on the patient link first when we have one: a patient may write from
  // the portal one week and from the public form the next, and those are the
  // same conversation even if they typed a different address the second time.
  const match = patientId
    ? [{ patientId }]
    : [
        ...(input.email ? [{ email: { equals: input.email, mode: 'insensitive' as const } }] : []),
        ...(digits.length >= 10 ? [{ phone: { endsWith: digits.slice(-10) } }] : []),
      ]

  const existing = match.length
    ? await prisma.inquiry.findFirst({
        where: { branch: input.branch, status: { not: 'CLOSED' }, OR: match },
        orderBy: { lastMessageAt: 'desc' },
      })
    : null

  if (existing) {
    await prisma.$transaction([
      prisma.inquiryMessage.create({
        data: { inquiryId: existing.id, fromStaff: false, body: input.body },
      }),
      prisma.inquiry.update({
        where: { id: existing.id },
        // Back to unread: a returning enquirer is new work even on a thread
        // somebody already answered.
        data: { status: 'OPEN', readAt: null, lastMessageAt: new Date() },
      }),
    ])
    return existing
  }

  const dayKey = manilaDateKey()

  for (let attempt = 0; attempt < 6; attempt++) {
    const ref = await nextRefCandidate(dayKey)
    try {
      return await prisma.$transaction(async (tx) => {
        const inquiry = await tx.inquiry.create({
          data: {
            ref,
            token: newInquiryToken(),
            branch: input.branch,
            patientId,
            name: input.name,
            email: input.email || null,
            phone: input.phone || null,
            subject: input.subject || null,
            lastMessageAt: new Date(),
          },
        })
        await tx.inquiryMessage.create({
          data: { inquiryId: inquiry.id, fromStaff: false, body: input.body },
        })
        return inquiry
      })
    } catch (err: unknown) {
      // P2002 = unique constraint. Someone took this ref between our read and
      // our write, which is exactly the case this loop exists for.
      const code = (err as { code?: string })?.code
      if (code === 'P2002' && attempt < 5) continue
      throw err
    }
  }
  // Six consecutive losses is not contention, it is something wrong.
  throw new Error('Could not allocate an enquiry reference')
}
