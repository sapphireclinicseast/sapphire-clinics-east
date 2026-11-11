// GET /api/decking/departed
//
// Bookings still sitting under consultants who have left.
//
// The board is a weekly template with no dates, so a booking is attached to a
// consultant's row rather than to a day in a diary. When someone is marked
// inactive in HR they drop off the board — correctly — but the children booked
// into their hours do not move anywhere. The rows stay in the database,
// pointing at somebody who no longer works here, and because the consultant is
// gone from the board nobody at the desk can see them.
//
// That is the gap this exists to close: the slots look occupied to the
// arithmetic and invisible to the people who could act on them. Sixty-three of
// them across nine departed consultants when this was written.
//
// Moving a child is done through the existing PATCH on /api/decking/slots,
// which already checks the replacement is active, works that department, and
// works that branch — so that decision stays where its rules live and the GET
// here never writes.
//
// The POST and DELETE below are the OTHER outcome: a family who are not
// continuing at all. They write a tag beside the booking and never touch the
// booking itself — see DeckingBookingDiscontinued for why nothing is deleted.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import type { StaffDepartment } from '@prisma/client'

export interface DepartedBooking {
  slotId: string
  staffId: string
  staffName: string
  branch: string
  department: string
  dayOfWeek: string
  startTime: string
  deliveryMode: string | null
  patientId: string | null
  patientName: string
}

export interface Replacement {
  id: string
  name: string
}

/** A booking the family has said they are not continuing. */
export interface DiscontinuedTag {
  remarks: string
  setByName: string | null
  /** ISO. When the decision was last recorded. */
  at: string
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Scoped to the branch the board is showing. The first version returned both
  // branches on the reasoning that a child may be moved across them — but the
  // page has a branch toggle, and a toggle that does not filter is a bug: the
  // Greenhills tab listed East's 55 bookings and read as if they were
  // Greenhills'. Cross-branch flexibility belongs in the "move to" list below,
  // which already offers consultants whose extraBranches cover this branch, not
  // in a list that claims to be one branch and is not.
  const branch = req.nextUrl.searchParams.get('branch') ?? undefined

  const slots = await prisma.deckingSlot.findMany({
    where: {
      isClass: false,
      disabled: false,
      patientId: { not: null },
      staff: { active: false },
      // No date filter on purpose — a patient left behind by a departed
      // consultant needs rehoming whether their session recurred or not.
      ...(branch ? { branch } : {}),
    },
    select: {
      id: true, staffId: true, branch: true, department: true,
      dayOfWeek: true, startTime: true, deliveryMode: true,
      staff: { select: { firstName: true, lastName: true } },
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  const DAY_ORDER = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']
  const rows: DepartedBooking[] = slots.map(s => ({
    slotId: s.id,
    staffId: s.staffId,
    staffName: `${s.staff?.firstName ?? ''} ${s.staff?.lastName ?? ''}`.trim() || 'Unknown',
    branch: s.branch,
    department: s.department ?? '',
    dayOfWeek: s.dayOfWeek,
    startTime: s.startTime,
    deliveryMode: s.deliveryMode,
    patientId: s.patient?.id ?? null,
    // A booking with no patient row is filtered out above, so this is only a
    // belt-and-braces label rather than an expected case.
    patientName: s.patient
      ? `${s.patient.firstName} ${s.patient.lastName}`.trim()
      : 'Unknown patient',
  })).sort((a, b) =>
    a.staffName.localeCompare(b.staffName) ||
    DAY_ORDER.indexOf(a.dayOfWeek) - DAY_ORDER.indexOf(b.dayOfWeek) ||
    a.startTime.localeCompare(b.startTime))

  // Who each booking could move to, keyed "BRANCH||DEPARTMENT".
  //
  // Worked out here rather than in the browser on purpose: /api/staff is
  // branch-scoped and hands a cross-branch caller an EMPTY roster rather than
  // an error, so a dropdown built from it would silently offer nobody for the
  // other branch and look like "there is no one to move them to".
  //
  // The same three conditions the PATCH enforces — active, that department,
  // that branch — so the list cannot offer a move the server will refuse.
  const pairs = [...new Set(rows.map(r => `${r.branch}||${r.department}`))]
  const replacements: Record<string, Replacement[]> = {}
  await Promise.all(pairs.map(async key => {
    const [branch, department] = key.split('||')
    if (!department) { replacements[key] = []; return }
    const staff = await prisma.staff.findMany({
      where: {
        active: true,
        department: department as StaffDepartment,
        OR: [{ branch }, { extraBranches: { has: branch } }],
      },
      select: { id: true, firstName: true, lastName: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    replacements[key] = staff.map(s => ({
      id: s.id,
      name: `${s.firstName} ${s.lastName}`.trim(),
    }))
  }))

  // Who has already been marked as not continuing. One query for the whole
  // page; a failure leaves the rows untagged rather than failing the list,
  // because the bookings are the point and the tags are an overlay.
  let discontinued: Record<string, DiscontinuedTag> = {}
  try {
    const tags = await prisma.deckingBookingDiscontinued.findMany({
      where: { slotId: { in: rows.map(r => r.slotId) } },
      select: { slotId: true, remarks: true, setByName: true, updatedAt: true },
    })
    discontinued = Object.fromEntries(tags.map(t => [t.slotId, {
      remarks: t.remarks, setByName: t.setByName, at: t.updatedAt.toISOString(),
    }]))
  } catch (err) {
    console.error('[decking/departed] discontinued lookup failed:', err)
  }

  return NextResponse.json({ rows, replacements, discontinued })
}

/**
 * Mark a booking as not continuing, or update its remark.
 *
 * An upsert, so pressing it twice corrects the note rather than erroring or
 * stacking a second row. Nothing about the booking or the patient changes —
 * the family may be back next year, and this has to be undoable without
 * having to reconstruct what they were having.
 */
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const setByName = (session.user as { name?: string } | undefined)?.name ?? null

  const body = await req.json().catch(() => ({}))
  const slotId = String(body.slotId ?? '')
  const remarks = String(body.remarks ?? '').trim().slice(0, 1000)
  if (!slotId) return NextResponse.json({ error: 'slotId is required' }, { status: 400 })

  // The slot has to be a real booking under a departed consultant — the same
  // set this page lists. Without this the route would tag any slot id at all.
  const slot = await prisma.deckingSlot.findFirst({
    where: { id: slotId, isClass: false, disabled: false, patientId: { not: null }, staff: { active: false } },
    select: { id: true, branch: true, patientId: true },
  })
  if (!slot) {
    return NextResponse.json(
      { error: 'That booking is not one of the departed-consultant bookings' }, { status: 404 })
  }

  const tag = await prisma.deckingBookingDiscontinued.upsert({
    where: { slotId },
    create: { slotId, patientId: slot.patientId, branch: slot.branch, remarks, setByName },
    update: { remarks, setByName },
  })

  return NextResponse.json({
    ok: true,
    discontinued: { remarks: tag.remarks, setByName: tag.setByName, at: tag.updatedAt.toISOString() },
  })
}

/**
 * Put a booking back on the rehoming list.
 *
 * The family changed their mind, or somebody tagged the wrong row. Deleting
 * the tag restores the booking exactly as it was, which is the whole reason
 * the booking was never touched.
 */
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const slotId = req.nextUrl.searchParams.get('slotId') ?? ''
  if (!slotId) return NextResponse.json({ error: 'slotId is required' }, { status: 400 })

  await prisma.deckingBookingDiscontinued.deleteMany({ where: { slotId } })
  return NextResponse.json({ ok: true })
}
