// GET /api/decking
//
// The logged-in clinician's own decking board. Read only, and scoped to them:
// a consultant has no business reading a colleague's patient list, and the
// scoping is done here rather than in the page, because a page gate is a
// suggestion.
//
// The rows come straight out of the hub's own tables — this app and the
// Operations Hub share one database. Front desk edit the board in two places,
// the Decking module and the Google Sheet (which syncs back into these rows
// every five minutes), and both land here with no copy in between.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

const DAYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const

export interface DeckingSlotOut {
  id: string
  staffId: string
  dayOfWeek: string
  startTime: string
  endTime: string
  branch: string
  department: string
  deliveryMode: string | null
  paymentType: string
  hmoProvider: string | null
  isClass: boolean
  notes: string | null
  /** Set only on a one-off or make-up: the single date it applies to. */
  date: string | null
  isMakeup: boolean
  /** A weekly hour front desk marked unavailable (break, blocked hour). */
  disabled: boolean
  patient: { id: string; firstName: string; lastName: string } | null
}

export interface DeckingConfigOut {
  staffId: string
  branch: string
  department: string
  deliveryMode: string | null
  workDays: string[]
  startTime: string
  endTime: string
  slotsPerDay: number | null
  slotMinutes: number | null
  breakStart: string | null
  breakMinutes: number | null
}

/** Today in Manila as YYYY-MM-DD — the clinic's day, not the server's. */
function manilaToday(): string {
  const p = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date())
  const get = (t: string) => p.find(x => x.type === t)?.value ?? ''
  return `${get('year')}-${get('month')}-${get('day')}`
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // EVERY branch this consultant works in, unioned.
  //
  // An interbranch consultant holds one Staff row per branch and is decked
  // separately in each. Scoping to the branch switcher showed one of those and
  // silently hid the other, which for somebody who works Mondays at East and
  // Thursdays at Greenhills is half a week missing with nothing saying so.
  // The board is per branch; the consultant is one person.
  //
  // A ?staffId is still honoured for a caller that genuinely wants one branch,
  // but ONLY when it is already one of this user's own — the gate is here
  // rather than in the page, because a page gate is a suggestion.
  const branchStaffIds = session.user.branches?.map(b => b.staffId).filter(Boolean) ?? []
  const ownIds = [...new Set([...branchStaffIds, session.user.staffId].filter(Boolean))] as string[]
  const requested = (req.nextUrl.searchParams.get('staffId') ?? '').trim()
  const staffIds: string[] = requested && ownIds.includes(requested) ? [requested] : ownIds
  // No staff record linked to this account — not an error, just nothing to
  // show. Returning [] lets the page say so instead of rendering a failure.
  if (staffIds.length === 0) {
    return NextResponse.json({ configs: [], weekly: [], dated: [], staff: [], today: manilaToday() })
  }

  const today = manilaToday()
  const todayDate = new Date(`${today}T00:00:00Z`)

  const [configs, slots, staffRows] = await Promise.all([
    prisma.deckingTherapistConfig.findMany({
      where: { staffId: { in: staffIds } },
      select: {
        staffId: true, branch: true, department: true, deliveryMode: true,
        workDays: true, startTime: true, endTime: true,
        slotsPerDay: true, slotMinutes: true, breakStart: true, breakMinutes: true,
      },
    }),
    prisma.deckingSlot.findMany({
      where: {
        staffId: { in: staffIds },
        // Weekly rows come with their disabled ones: the board is drawn as the
        // hub's grid now (Hannah 11/16), and an hour front desk closed has to
        // show hatched "Unavailable" there — left out, it would read as open.
        // Dated rows: only enabled ones, from today forward. A term's worth of
        // lapsed one-offs is exactly the clutter the hub hides from the Sheet,
        // and it would bury this week's actual board.
        OR: [{ date: null }, { date: { gte: todayDate }, disabled: false }],
      },
      select: {
        id: true, staffId: true, disabled: true, dayOfWeek: true, startTime: true, endTime: true,
        branch: true, department: true, deliveryMode: true,
        paymentType: true, hmoProvider: true, isClass: true, notes: true,
        date: true, isMakeup: true, patientId: true,
      },
      orderBy: [{ date: 'asc' }, { startTime: 'asc' }],
    }),
    // For the card header: whose board it is, as the hub's cards show it.
    prisma.staff.findMany({
      where: { id: { in: staffIds } },
      select: { id: true, firstName: true, lastName: true, department: true },
    }),
  ])

  // Patients in one query rather than a join, which keeps the Decking models
  // in this app free of relations into tables the hub owns.
  const patientIds = [...new Set(slots.map(s => s.patientId).filter((x): x is string => !!x))]
  const patients = patientIds.length
    ? await prisma.patient.findMany({
        where: { id: { in: patientIds } },
        select: { id: true, firstName: true, lastName: true },
      })
    : []
  const byId = new Map(patients.map(p => [p.id, p]))

  const shape = (s: typeof slots[number]): DeckingSlotOut => ({
    id: s.id,
    staffId: s.staffId,
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    endTime: s.endTime,
    branch: s.branch,
    department: s.department,
    deliveryMode: s.deliveryMode,
    paymentType: s.paymentType,
    hmoProvider: s.hmoProvider,
    isClass: s.isClass,
    notes: s.notes,
    date: s.date ? s.date.toISOString().slice(0, 10) : null,
    isMakeup: s.isMakeup,
    disabled: s.disabled,
    patient: s.patientId ? byId.get(s.patientId) ?? null : null,
  })

  // Weekly and dated are kept apart on purpose. A one-off drawn in its weekday
  // column reads as "every Tuesday", which is the thing the hub's own board
  // goes to some trouble to avoid saying.
  const weekly = slots.filter(s => !s.date)
    .map(shape)
    .sort((a, b) => DAYS.indexOf(a.dayOfWeek as never) - DAYS.indexOf(b.dayOfWeek as never)
      || a.startTime.localeCompare(b.startTime))
  const dated = slots.filter(s => s.date).map(shape)

  return NextResponse.json({
    today,
    staff: staffRows.map(st => ({ id: st.id, firstName: st.firstName, lastName: st.lastName, department: String(st.department) })),
    configs: configs.map((c): DeckingConfigOut => ({
      staffId: c.staffId,
      branch: c.branch,
      department: c.department,
      deliveryMode: c.deliveryMode,
      workDays: Array.isArray(c.workDays) ? (c.workDays as string[]) : [],
      startTime: c.startTime,
      endTime: c.endTime,
      slotsPerDay: c.slotsPerDay,
      slotMinutes: c.slotMinutes,
      breakStart: c.breakStart,
      breakMinutes: c.breakMinutes,
    })),
    weekly,
    dated,
  })
}
