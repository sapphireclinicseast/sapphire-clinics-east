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
}

/**
 * Create an enquiry and its first message atomically, retrying on a ref clash.
 *
 * Both rows go in one transaction: an enquiry with no message would show in the
 * inbox as an empty thread, which reads as a bug rather than as the partial
 * write it is.
 */
export async function createInquiryWithRef(input: NewInquiryInput) {
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
