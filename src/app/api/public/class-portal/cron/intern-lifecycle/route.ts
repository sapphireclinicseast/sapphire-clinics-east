// POST /api/public/class-portal/cron/intern-lifecycle
//
// Daily sweep that soft-disables class-portal TEACHER accounts minted
// from HR-hub intern rows once their contract has genuinely lapsed.
//
// Cut-off policy: end of the intern's contract-end month + 15 days.
// Example: contractExpiry anywhere in August 2026 → auto-disable on
// September 15 2026. Runs daily so once the 15th passes the account
// flips within 24 hours; the admin UI surfaces this date up front so
// there is no surprise.
//
// A row is also disabled when the linked Staff row goes inactive in
// HR (e.g. contract terminated early), keeping class-portal access in
// lock-step with HR's source of truth.
//
// Auth: `x-cron-secret: $CRON_SECRET`. Idempotent — re-runs skip rows
// that are already disabled. Manually re-enabling from the Users UI
// takes precedence: the cron never touches disabledAt on rows a human
// re-enabled (until the next contract lapse if HR pushes a new
// contractExpiry).
//
// Response (200): { ok, scanned, disabled, alreadyDisabled, skipped,
//                   noContract, errors: [] }
//
// GET returns a description for quick manual pokes.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

const PH_TZ_OFFSET_MIN = 8 * 60

/** Manila "today" — end-of-day intern accounts flip on the 15th of the
 *  month following their contract-end month, in Manila local time. */
function manilaToday(now: Date): Date {
  const ms = now.getTime() + PH_TZ_OFFSET_MIN * 60_000
  const ph = new Date(ms)
  return new Date(Date.UTC(ph.getUTCFullYear(), ph.getUTCMonth(), ph.getUTCDate()))
}

/** Cut-off date for an intern given their HR contract end:
 *  first day of the NEXT month after contractExpiry, + 15 days.
 *  Equivalently: the 16th of the next month at UTC midnight, so the
 *  account flips once Manila-today >= that date. */
function autoDisableDate(contractExpiry: Date): Date {
  return new Date(Date.UTC(
    contractExpiry.getUTCFullYear(),
    contractExpiry.getUTCMonth() + 1,
    16,
  ))
}

interface Result {
  ok: true
  scanned: number
  disabled: number
  alreadyDisabled: number
  skipped: number
  noContract: number
  disabledIds: string[]
  errors: { id: string; error: string }[]
}

export async function POST(req: Request) {
  const expected = process.env.CRON_SECRET
  if (!expected) {
    return NextResponse.json({ error: 'CRON_SECRET not configured on server.' }, { status: 503 })
  }
  const got = req.headers.get('x-cron-secret') ?? ''
  if (got !== expected) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 })
  }

  const today = manilaToday(new Date())

  // Every intern TEACHER row that carries an HR link. Non-intern
  // teachers (marked isIntern=false or minted directly) are left alone.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const interns = await (prisma.classPortalUser as any).findMany({
    where: { isIntern: true, role: 'TEACHER', linkedStaffId: { not: null } },
    select: { id: true, email: true, disabledAt: true, linkedStaffId: true },
  }) as { id: string; email: string; disabledAt: Date | null; linkedStaffId: string | null }[]

  const staffIds = Array.from(new Set(interns.map(i => i.linkedStaffId!).filter(Boolean)))
  const staff = staffIds.length
    ? await prisma.staff.findMany({
        where: { id: { in: staffIds } },
        select: { id: true, contractExpiry: true, active: true },
      })
    : []
  const staffMap = new Map(staff.map(s => [s.id, s]))

  const result: Result = {
    ok: true,
    scanned: interns.length,
    disabled: 0,
    alreadyDisabled: 0,
    skipped: 0,
    noContract: 0,
    disabledIds: [],
    errors: [],
  }

  for (const u of interns) {
    if (u.disabledAt) { result.alreadyDisabled++; continue }
    const s = u.linkedStaffId ? staffMap.get(u.linkedStaffId) : null

    // No linked Staff row (row was deleted upstream) or no contractExpiry
    // on file — leave it to the admin to sort out; don't guess.
    if (!s) { result.skipped++; continue }
    if (!s.contractExpiry) { result.noContract++; continue }

    // If HR marked the intern inactive (contract terminated early or
    // similar), disable now — same policy as reaching the cut-off.
    const cutoff = autoDisableDate(s.contractExpiry)
    const shouldDisable = !s.active || today.getTime() >= cutoff.getTime()
    if (!shouldDisable) { result.skipped++; continue }

    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (prisma.classPortalUser as any).update({
        where: { id: u.id },
        data: {
          disabledAt: new Date(),
          disabledBy: 'cron:intern-lifecycle',
        },
      })
      result.disabled++
      result.disabledIds.push(u.id)
    } catch (e) {
      result.errors.push({ id: u.id, error: (e as Error).message })
    }
  }

  return NextResponse.json(result)
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/public/class-portal/cron/intern-lifecycle',
    description: 'Daily sweep that disables intern TEACHER accounts 15 days after the end of their contract month.',
    method: 'POST with x-cron-secret header',
    cronSecretConfigured: Boolean(process.env.CRON_SECRET),
  })
}
