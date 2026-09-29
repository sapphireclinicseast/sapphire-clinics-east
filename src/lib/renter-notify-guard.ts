// Server-side gate on clinic-schedule notifications for renting clinicians.
//
// The buttons are hidden in the UI too, but hiding a button is decoration: the
// note under the Clinician row says a patient status change sends the clinician
// an SMS by itself, and anything added later will reach these routes without
// going near the button. Refusing here is the part that actually holds, and it
// keeps the rule in ONE place rather than in six components.
//
// Separate module from lib/employment.ts on purpose — that one is imported by a
// client component, and this one pulls in Prisma.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { isRenter, RENTER_NOTIFY_REASON } from '@/lib/employment'

interface GuardArgs {
  /** The clinician, when the caller names one directly. */
  staffId?: string | null
  /** A single appointment, when the caller names one instead — the clinician is
   *  read off it. */
  scheduleId?: string | null
  /** Branch being worked in, so an interbranch clinician is judged by the
   *  classification that applies HERE. */
  branch?: string | null
}

/**
 * Returns a 403 to hand straight back, or null when the send may proceed.
 *
 * Fails OPEN when the clinician cannot be identified: a missing or malformed id
 * is the route's own business to reject with its own message, and swallowing it
 * here would turn "bad request" into a confusing "renter" refusal.
 */
export async function blockIfRenterNotify(args: GuardArgs): Promise<NextResponse | null> {
  const select = {
    firstName: true,
    employmentType: true,
    employmentByBranch: true,
    branchEmployment: true,
  } as const

  let staff: {
    firstName: string
    employmentType: string | null
    employmentByBranch: unknown
    branchEmployment: unknown
  } | null = null

  if (args.staffId) {
    staff = await prisma.staff.findUnique({ where: { id: args.staffId }, select })
  } else if (args.scheduleId) {
    const schedule = await prisma.schedule.findUnique({
      where: { id: args.scheduleId },
      select: { staff: { select } },
    })
    staff = schedule?.staff ?? null
  }

  if (!staff || !isRenter(staff, args.branch)) return null

  return NextResponse.json(
    { error: `${staff.firstName} rents the facility. ${RENTER_NOTIFY_REASON}` },
    { status: 403 },
  )
}
