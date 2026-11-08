// Who has read which enquiry.
//
// Read state used to be one `readAt` timestamp on the Inquiry itself, which
// made it the clinic's state rather than a person's: a main admin opening an
// enquiry to see what it was cleared the unread dot for the front desk who was
// meant to answer it, and the enquiry then looked handled to everyone. The
// badge, the inbox list and the notification bell all read that one flag, so
// one glance hid an enquiry in three places at once.
//
// It is per account now (InquiryRead). The rule is in one place here because
// three callers have to agree about it — if the badge and the list disagree,
// the badge is worthless.
//
// ── The rule ────────────────────────────────────────────────────────────────
// An enquiry is unread FOR ME when:
//
//   status is OPEN                 — the enquirer is waiting on a reply, and
//   I have no read mark on it      — or my mark predates its last message
//
// Three consequences worth stating, because each was a decision:
//
//   * Me opening it marks it read for me alone. Another account's dot is their
//     business. That is the whole point of the change.
//   * Anyone REPLYING clears it for everybody, because the reply moves the
//     thread to ANSWERED and nothing is waiting any more. Without this, a
//     colleague answering an enquiry would leave four other people a dot on a
//     thread with nothing left to do, and a badge that cries wolf gets ignored.
//   * The enquirer writing back makes it unread for everybody again, including
//     whoever read it ten minutes earlier — that is what comparing against
//     lastMessageAt buys over a bare flag.

import { prisma } from '@/lib/prisma'

/** The slice of an enquiry the rule needs. */
export interface ReadableInquiry {
  id: string
  status: string
  lastMessageAt: Date | string
}

/**
 * Is this enquiry unread for the account whose read marks `readMap` holds?
 *
 * `readMap` maps enquiry id → when that account opened it.
 */
export function isUnreadFor(inq: ReadableInquiry, readMap: Map<string, Date>): boolean {
  if (inq.status !== 'OPEN') return false
  const mine = readMap.get(inq.id)
  if (!mine) return true
  return mine.getTime() < new Date(inq.lastMessageAt).getTime()
}

/** When this account opened each of these enquiries. Absent = never. */
export async function readMarksFor(
  userId: string,
  inquiryIds: string[],
): Promise<Map<string, Date>> {
  if (!userId || inquiryIds.length === 0) return new Map()
  const rows = await prisma.inquiryRead.findMany({
    where: { userId, inquiryId: { in: inquiryIds } },
    select: { inquiryId: true, readAt: true },
  })
  return new Map(rows.map(r => [r.inquiryId, r.readAt]))
}

/**
 * Record that this account has opened this enquiry, now.
 *
 * Upsert rather than create: the unique index on (inquiryId, userId) means two
 * tabs opening the same thread cannot leave two marks, and re-opening after the
 * enquirer wrote back has to move the timestamp forward or the thread would
 * stay unread for someone who has just read it.
 */
export async function markInquiryRead(inquiryId: string, userId: string): Promise<void> {
  if (!userId) return
  try {
    await prisma.inquiryRead.upsert({
      where: { inquiryId_userId: { inquiryId, userId } },
      create: { inquiryId, userId },
      update: { readAt: new Date() },
    })
  } catch (err) {
    // Reading an enquiry must not fail because we could not write down that it
    // was read — the operator would see an error on a thread that opened fine.
    console.error('[inquiry-read] could not mark read:', err)
  }
}

/**
 * How many enquiries are unread for this account, within one branch or across
 * all of them.
 *
 * Raw SQL because the rule compares two columns of the same row (my read mark
 * against the thread's last message), which Prisma's filter language cannot
 * express. Counted over the same scope the inbox list uses, so the badge and
 * the list can never disagree.
 */
export async function countUnreadFor(userId: string, branch?: string): Promise<number> {
  if (!userId) return 0
  // status is a PG enum; compared as text so the driver adapter does not have
  // to cast a parameter into "InquiryStatus".
  const rows = branch
    ? await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n
          FROM "Inquiry" i
          LEFT JOIN "InquiryRead" r ON r."inquiryId" = i."id" AND r."userId" = ${userId}
         WHERE i."status"::text = 'OPEN'
           AND i."branch" = ${branch}
           AND (r."readAt" IS NULL OR r."readAt" < i."lastMessageAt")`
    : await prisma.$queryRaw<{ n: bigint }[]>`
        SELECT count(*) AS n
          FROM "Inquiry" i
          LEFT JOIN "InquiryRead" r ON r."inquiryId" = i."id" AND r."userId" = ${userId}
         WHERE i."status"::text = 'OPEN'
           AND (r."readAt" IS NULL OR r."readAt" < i."lastMessageAt")`
  return Number(rows[0]?.n ?? 0)
}
