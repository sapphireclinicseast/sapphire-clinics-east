import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { canWriteSlot, CROSS_BRANCH_DENIED } from '@/lib/decking-access'

const PAYMENT_TYPES = ['CASH', 'HMO', 'GL'] as const

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const staffId   = searchParams.get('staffId')
  const branch    = searchParams.get('branch')
  const dayOfWeek = searchParams.get('dayOfWeek')
  const supervised = searchParams.get('includeSupervised') === '1'
  const includeDated = searchParams.get('includeDated') === '1'
  // One named calendar date — the make-up / one-off hours for that day, and
  // nothing recurring. Clinic Schedule asks for this so a clinician who is not
  // normally in on a Thursday still shows the hours they ARE in for.
  const dateParam = searchParams.get('date')
  // Every dated row and no weekly ones. Reading make-ups across the calendar
  // used to mean pulling the whole weekly board and filtering in the browser.
  const onlyDated = searchParams.get('dated') === '1'

  const exactDate = (() => {
    if (!dateParam) return undefined
    const d = new Date(`${dateParam.slice(0, 10)}T00:00:00Z`)
    return Number.isNaN(d.getTime()) ? null : d
  })()
  // An unparseable date matches nothing rather than falling through to "every
  // slot": a bad parameter should return an empty day, not the whole board.
  if (exactDate === null) return NextResponse.json([])

  const slots = await prisma.deckingSlot.findMany({
    where: {
      // With includeSupervised, a clinician's slots AND the intern slots they
      // supervise. Clinic Schedule lodges an intern's session under the
      // supervising clinician, so when front desk schedule that clinician the
      // intern's decked hours have to be offered there too — otherwise the
      // intern has hours in Decking that can never become a session.
      ...(staffId
        ? (supervised ? { OR: [{ staffId }, { supervisorId: staffId }] } : { staffId })
        : {}),
      ...(branch    ? { branch }    : {}),
      ...(dayOfWeek ? { dayOfWeek } : {}),
      // The weekly board draws recurring slots only: a dated one-off would
      // appear in its weekday column every week, for ever. includeDated lifts
      // that for the board itself, which lists the one-offs separately — and
      // has to, or front desk would create a dated slot and watch it vanish.
      //
      // `date` and `dated` are the other way round: dated rows ONLY. They are
      // checked first because asking for one date and being given the weekly
      // pattern as well would put a recurring Tuesday into a Thursday make-up.
      ...(exactDate ? { date: exactDate }
        : onlyDated ? { date: { not: null } }
        : includeDated ? {} : { date: null }),
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
      // Named so the caller can tell an intern's slot from the clinician's own
      // and label the two differently.
      staff: { select: { id: true, firstName: true, lastName: true, employmentType: true } },
    },
    orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }],
  })
  return NextResponse.json(slots)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, patientId, dayOfWeek, startTime, endTime, branch, department, notes, disabled, paymentType, isClass , deliveryMode, supervisorId, date, isMakeup } = await req.json()
  if (!staffId || !dayOfWeek || !startTime || !endTime)
    return NextResponse.json({ error: 'staffId, dayOfWeek, startTime, endTime are required' }, { status: 400 })

  const isDisabled = disabled === true

  // A one-off on a named date, for the consultants who give the clinic
  // specific days rather than a standing weekly pattern — medical doctors
  // mostly, and psychology. Stored as a real date so it cannot be mistaken for
  // "every Thursday"; every weekly view filters these out.
  //
  // Parsed at UTC midnight to match how the column is read everywhere else; an
  // unparseable value is treated as no date rather than as today, because
  // silently making a one-off recurring is the worse failure.
  const parsedDate = (() => {
    if (!date) return null
    const d = new Date(`${String(date).slice(0, 10)}T00:00:00Z`)
    return Number.isNaN(d.getTime()) ? null : d
  })()

  if (isDisabled) {
    // Only one disabled marker per staff/day/time cell
    const alreadyDisabled = await prisma.deckingSlot.findFirst({
      where: { staffId, dayOfWeek, startTime, disabled: true, date: parsedDate },
    })
    if (alreadyDisabled) {
      return NextResponse.json({ error: 'Slot is already disabled' }, { status: 400 })
    }
  } else {
    // Max 3 patients per time slot — a therapist runs one-to-one or a small
    // pair, so a fourth name in an hour is a mistake worth blocking.
    //
    // Class bookings are exempt: a class is many children by definition, and
    // capping it at 3 would cap the class size. Keyed off isClass rather than
    // department, because a 1-on-1 SPED session is still 1-on-1 and keeps the
    // cap — exempting the whole department also exempted those.
    if (!isClass) {
      const existing = await prisma.deckingSlot.count({
        // Scoped to the same date (or to the weekly pattern when there is
        // none): a one-off on the 12th must not be blocked by the three
        // patients who hold that hour every week.
        where: { staffId, dayOfWeek, startTime, disabled: false, isClass: false, date: parsedDate },
      })
      if (existing >= 3)
        return NextResponse.json({ error: 'Maximum 3 patients per time slot' }, { status: 400 })
    }
  }

  const postRole = (session.user as { role?: string })?.role ?? ''
  const postMode = ['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(deliveryMode) ? deliveryMode : null
  if (!canWriteSlot(postRole, branch, postMode)) {
    return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })
  }

  const slot = await prisma.deckingSlot.create({
    data: {
      staffId, dayOfWeek, startTime, endTime, branch, department,
      patientId: isDisabled ? null : (patientId || null),
      date: parsedDate,
      // A make-up is a one-off with a reason: a session replacing one the
      // patient missed, on a day outside the clinician's weekly schedule.
      // Only meaningful WITH a date — a weekly slot is never a make-up, and
      // honouring the flag without one would put a permanent "make-up" on the
      // board every week.
      isMakeup: parsedDate ? isMakeup === true : false,
      // Who supervises, when this hour belongs to an intern. A reference, not
      // a booking — the supervisor's own hour stays sellable.
      supervisorId: supervisorId || null,
      notes: notes || null,
      // Whitelisted rather than passed through: this drives the board's colour
      // coding, and an unrecognised value would render as an uncoloured cell
      // that looks like plain cash.
      paymentType: PAYMENT_TYPES.includes(paymentType) ? paymentType : 'CASH',
      isClass: isClass === true,
      // Only the three known modes are stored; anything else lands as null
      // (unclassified) rather than as a value no board knows how to place.
      deliveryMode: ['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(deliveryMode) ? deliveryMode : null,
      disabled: isDisabled,
    },
    include: {
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  })
  return NextResponse.json(slot)
}

// PATCH — change an existing slot's payment type. Front desk usually learns
// whether a session is HMO or GL after the patient is already decked, so this
// has to be editable in place rather than only at creation.
export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const patchBody = await req.json()

  // ── Hide (or show) a whole one-off date in the Google Sheet ──────────────
  //
  // Per DAY, like the delete beside it: a one-off is one offer and the clinic
  // hides it as one. Nothing about the slots changes except whether the sheet
  // draws them — the board, the bookings, the payments and the history are
  // all untouched, which is the point. A lapsed date is still the record of
  // who was seen that day.
  if (!patchBody.id && patchBody.staffId && patchBody.date && typeof patchBody.sheetHidden === 'boolean') {
    const dateKey = String(patchBody.date).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }
    const role = (session.user as { role?: string })?.role ?? ''
    const dayStart = new Date(`${dateKey}T00:00:00.000Z`)
    const dayEnd = new Date(`${dateKey}T23:59:59.999Z`)

    const slots = await prisma.deckingSlot.findMany({
      where: { staffId: String(patchBody.staffId), date: { gte: dayStart, lte: dayEnd } },
      select: { id: true, branch: true, deliveryMode: true },
    })
    if (slots.length === 0) {
      return NextResponse.json({ error: 'No one-off slots on that date' }, { status: 404 })
    }
    const denied = slots.find(sl => !canWriteSlot(role, sl.branch, sl.deliveryMode))
    if (denied) return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })

    const { count } = await prisma.deckingSlot.updateMany({
      where: { id: { in: slots.map(sl => sl.id) } },
      data: { sheetHidden: patchBody.sheetHidden },
    })
    return NextResponse.json({ ok: true, updated: count, sheetHidden: patchBody.sheetHidden })
  }

  // Destructured from the body already read above — a request body can only
  // be consumed once, and the day-level branch needed it first.
  const { id, paymentType, staffId, deliveryMode, supervisorId, patientId } = patchBody
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // Putting a patient into an existing slot, or taking them out.
  //
  // One-off dates are created EMPTY — a doctor gives the clinic a date before
  // anyone is booked into it — so without this there is no way to fill one
  // afterwards. The weekly grid has cells that create a slot and a patient
  // together; a dated slot already exists and only needs the patient.
  if (patientId !== undefined) {
    const updated = await prisma.deckingSlot.update({
      where: { id },
      data: { patientId: patientId || null },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    })
    return NextResponse.json(updated)
  }

  // Changing who supervises an intern's hour. Sent on its own so the picker in
  // the intern row can be changed without touching the booking.
  if (supervisorId !== undefined) {
    const updated = await prisma.deckingSlot.update({
      where: { id },
      data: { supervisorId: supervisorId || null },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    })
    return NextResponse.json(updated)
  }

  // Reassigning the consultant a slot belongs to. Needed because every SPED
  // class child added before the board tracked teachers per group landed on
  // whichever consultant happened to be first on the roster — at East that is
  // 45 children all filed under one teacher, and there was no way to correct it
  // from the board.
  const patchRole = (session.user as { role?: string })?.role ?? ''
  const target = await prisma.deckingSlot.findUnique({
    where: { id }, select: { branch: true, deliveryMode: true },
  })
  if (!target) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  if (!canWriteSlot(patchRole, target.branch, target.deliveryMode)) {
    return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })
  }

  if (staffId !== undefined) {
    if (typeof staffId !== 'string' || !staffId.trim()) {
      return NextResponse.json({ error: 'staffId must be a staff id' }, { status: 400 })
    }
    const existing = await prisma.deckingSlot.findUnique({
      where: { id }, select: { branch: true, department: true },
    })
    if (!existing) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })

    // The new consultant has to actually work that department at that branch —
    // otherwise a mis-click could file a child under someone who does not run
    // the class, which is the very problem this is here to fix.
    const target = await prisma.staff.findFirst({
      where: {
        id: staffId,
        active: true,
        department: existing.department as never,
        OR: [{ branch: existing.branch }, { extraBranches: { has: existing.branch } }],
      },
      select: { id: true },
    })
    if (!target) {
      return NextResponse.json(
        { error: 'That consultant does not work this department at this branch.' },
        { status: 400 },
      )
    }

    const moved = await prisma.deckingSlot.update({
      where: { id },
      data: { staffId },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    })
    return NextResponse.json(moved)
  }

  // Classifying an existing slot — how the session is delivered. Separate from
  // the payment branch below so a slot can be classified without touching how
  // it is paid for.
  if (deliveryMode !== undefined) {
    if (!['ONSITE', 'TELETHERAPY', 'HOMECARE'].includes(deliveryMode)) {
      return NextResponse.json({ error: 'deliveryMode must be ONSITE, TELETHERAPY or HOMECARE' }, { status: 400 })
    }
    const updated = await prisma.deckingSlot.update({
      where: { id },
      data: { deliveryMode },
      include: { patient: { select: { id: true, firstName: true, lastName: true } } },
    })
    return NextResponse.json(updated)
  }

  if (!PAYMENT_TYPES.includes(paymentType)) {
    return NextResponse.json({ error: `paymentType must be one of ${PAYMENT_TYPES.join(', ')}` }, { status: 400 })
  }

  const slot = await prisma.deckingSlot.update({
    where: { id },
    data: { paymentType },
    include: { patient: { select: { id: true, firstName: true, lastName: true } } },
  })
  return NextResponse.json(slot)
}

export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { id } = body
  const delRole = (session.user as { role?: string })?.role ?? ''

  // ── A whole one-off day ──────────────────────────────────────────────────
  //
  // Done here rather than by the browser calling the single-slot delete once
  // per hour. A doctor's one-off day can be sixteen half-hour slots; sixteen
  // requests fail independently, and a day half-removed is worse than one
  // still there — the board would show an afternoon with no morning and
  // nobody would know whether that was intended.
  //
  // Only ever dated slots. The weekly template is edited through the grid and
  // a staffId+weekday delete here would be a way to wipe a consultant's
  // standing hours by accident.
  if (!id && body.staffId && body.date) {
    const dateKey = String(body.date).slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      return NextResponse.json({ error: 'date must be YYYY-MM-DD' }, { status: 400 })
    }
    const dayStart = new Date(`${dateKey}T00:00:00.000Z`)
    const dayEnd = new Date(`${dateKey}T23:59:59.999Z`)

    const slots = await prisma.deckingSlot.findMany({
      where: { staffId: String(body.staffId), date: { gte: dayStart, lte: dayEnd } },
      select: { id: true, branch: true, deliveryMode: true, patientId: true },
    })
    if (slots.length === 0) {
      return NextResponse.json({ error: 'No one-off slots on that date' }, { status: 404 })
    }
    // Every slot, not just the first: a day can mix delivery modes, and the
    // branch rule has to hold for all of them or none are removed.
    const denied = slots.find(sl => !canWriteSlot(delRole, sl.branch, sl.deliveryMode))
    if (denied) return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })

    const booked = slots.filter(sl => sl.patientId).length
    // The caller has to have been told how many children are in the day and
    // say yes to that number. Without this the first click would remove
    // bookings the person could not see — the tile says "3 booked", but the
    // button is next to the date, not the children.
    if (booked > 0 && body.confirmBooked !== true) {
      return NextResponse.json({ needsConfirm: true, slots: slots.length, booked }, { status: 409 })
    }

    const { count } = await prisma.deckingSlot.deleteMany({
      where: { id: { in: slots.map(sl => sl.id) } },
    })
    return NextResponse.json({ ok: true, deleted: count, booked })
  }

  const doomed = await prisma.deckingSlot.findUnique({
    where: { id }, select: { branch: true, deliveryMode: true },
  })
  if (!doomed) return NextResponse.json({ error: 'Slot not found' }, { status: 404 })
  if (!canWriteSlot(delRole, doomed.branch, doomed.deliveryMode)) {
    return NextResponse.json({ error: CROSS_BRANCH_DENIED }, { status: 403 })
  }
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  await prisma.deckingSlot.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
