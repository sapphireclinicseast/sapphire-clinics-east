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
// Read-only. Moving a child is done through the existing PATCH on
// /api/decking/slots, which already checks the replacement is active, works
// that department, and works that branch — so the decision stays a decision
// and this route never writes.

import { NextResponse } from 'next/server'
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

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Both branches read both boards, same as the board itself — a child gets
  // coordinated across branches and you cannot do that through a keyhole.
  const slots = await prisma.deckingSlot.findMany({
    where: {
      isClass: false,
      disabled: false,
      patientId: { not: null },
      staff: { active: false },
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

  return NextResponse.json({ rows, replacements })
}
