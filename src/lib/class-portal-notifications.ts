// Server-side helper for writing bell-icon notifications.
//
// Call `createNotification` from any class-portal mutation that
// should ping the recipient's bell (new announcement, payment
// confirmation, class-content change, promissory-note upload …).
// For fan-outs — one event, many recipients — call
// `createNotifications` with the full roster so Prisma can batch.
//
// Best-effort: every write is wrapped in try/catch so a notification
// failure never breaks the user-facing flow (if the DB momentarily
// can't accept writes, the mutation that triggered it still succeeds).

import { prisma } from '@/lib/prisma'
import type { ClassPortalNotificationKind, Prisma } from '@prisma/client'

export interface CreateNotificationArgs {
  userId: string
  kind: ClassPortalNotificationKind
  title: string
  body: string
  href?: string | null
  payload?: Prisma.JsonObject | null
}

/** Write one notification. Returns the row or null on failure. */
export async function createNotification(args: CreateNotificationArgs) {
  try {
    return await prisma.classPortalNotification.create({
      data: {
        userId: args.userId,
        kind: args.kind,
        title: args.title.slice(0, 200),
        body: args.body.slice(0, 1000),
        href: args.href ?? null,
        payloadJson: args.payload ?? undefined,
      },
    })
  } catch {
    return null
  }
}

/**
 * Fan-out one event to a roster of recipients. Deduplicates on
 * userId so a double-queued recipient only gets one row. Uses
 * `createMany` with `skipDuplicates` where possible for a single
 * DB round-trip.
 */
export async function createNotifications(
  recipients: string[],
  shared: Omit<CreateNotificationArgs, 'userId'>,
) {
  const unique = Array.from(new Set(recipients.filter(Boolean)))
  if (unique.length === 0) return { written: 0 }
  try {
    const result = await prisma.classPortalNotification.createMany({
      data: unique.map(userId => ({
        userId,
        kind: shared.kind,
        title: shared.title.slice(0, 200),
        body: shared.body.slice(0, 1000),
        href: shared.href ?? null,
        payloadJson: shared.payload ?? undefined,
      })),
    })
    return { written: result.count }
  } catch {
    return { written: 0 }
  }
}

/**
 * Resolve the set of ClassPortalUser ids who are ADMIN or branch-
 * matched (BRANCH_ADMIN + FRONTDESK) for a given branch. Used by the
 * PENDING_PAYMENT fan-out so a cashier submitting a paymongo claim
 * pings the right desk, not every desk in the country.
 */
export async function staffRecipientsForBranch(branch: string | null) {
  const rows = await prisma.classPortalUser.findMany({
    where: {
      disabledAt: null,
      OR: [
        { role: 'ADMIN' },
        { role: { in: ['BRANCH_ADMIN', 'FRONTDESK'] }, branch: branch as any },
      ],
    },
    select: { id: true },
  })
  return rows.map(r => r.id)
}
