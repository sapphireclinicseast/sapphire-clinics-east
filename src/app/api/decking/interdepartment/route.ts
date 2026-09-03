// GET /api/decking/interdepartment?branch=SBEA
//
// Who on the decking board is already seeing more than one department, and who
// is not — the second group being the cross-sell list.
//
// Read off the decking board itself (DeckingSlot), not Schedule: the board is
// what front desk work from, so "the patients on our sheet" means the ones with
// a slot on it.

import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * The combinations this clinic actually sees, given by the clinic.
 *
 * Suggestions come from these pairs rather than from "every department they do
 * not have". The complement would propose MD, Orthosis and Psychology to every
 * child on the board, which is noise a front desk would learn to ignore — and a
 * cross-sell list nobody reads is worse than none.
 *
 * Edit this list to change what gets suggested; nothing else needs to change.
 */
const COMMON_PAIRS: [string, string][] = [
  ['OT', 'SPED'],
  ['OT', 'SLP'],
  ['SLP', 'SPED'],
  ['OT', 'PT'],
]

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branch = req.nextUrl.searchParams.get('branch') || ''
  if (!branch) return NextResponse.json({ error: 'branch is required' }, { status: 400 })

  // Every booked cell on the board, at EVERY branch — not just the one being
  // viewed. A patient having OT here and SLP at the other branch is already an
  // interdepartment patient, and scoping the query to one branch would file
  // them as a cross-sell target for something they are, in fact, already
  // getting. Disabled cells carry no patient and are excluded.
  const slots = await prisma.deckingSlot.findMany({
    where: { disabled: false, patientId: { not: null } },
    select: {
      patientId: true,
      department: true,
      branch: true,
      isClass: true,
      patient: { select: { id: true, firstName: true, lastName: true } },
    },
  })

  interface Acc {
    id: string
    name: string
    here: Set<string>
    elsewhere: Set<string>
    onThisBoard: boolean
  }
  const byPatient = new Map<string, Acc>()

  for (const s of slots) {
    if (!s.patientId || !s.patient) continue
    let acc = byPatient.get(s.patientId)
    if (!acc) {
      acc = {
        id: s.patientId,
        name: `${s.patient.lastName}, ${s.patient.firstName}`,
        here: new Set(),
        elsewhere: new Set(),
        onThisBoard: false,
      }
      byPatient.set(s.patientId, acc)
    }
    if (s.branch === branch) {
      acc.here.add(s.department)
      acc.onThisBoard = true
    } else {
      acc.elsewhere.add(s.department)
    }
  }

  const rows = [...byPatient.values()]
    // The list is about this branch's board; a patient seen only at the other
    // branch is not front desk's to cross-sell from here.
    .filter(a => a.onThisBoard)
    .map(a => {
      const all = new Set([...a.here, ...a.elsewhere])
      const suggestions = new Set<string>()
      for (const [x, y] of COMMON_PAIRS) {
        if (all.has(x) && !all.has(y)) suggestions.add(y)
        if (all.has(y) && !all.has(x)) suggestions.add(x)
      }
      return {
        id: a.id,
        name: a.name,
        departments: [...a.here].sort(),
        otherBranchDepartments: [...a.elsewhere].sort(),
        // Counts departments across both branches — that is what decides
        // whether this patient is already interdepartment.
        departmentCount: all.size,
        suggestions: [...suggestions].sort(),
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name))

  const interdepartment = rows.filter(r => r.departmentCount > 1)
  const singleDepartment = rows.filter(r => r.departmentCount === 1)

  return NextResponse.json({
    interdepartment,
    singleDepartment,
    summary: {
      total: rows.length,
      interdepartment: interdepartment.length,
      singleDepartment: singleDepartment.length,
      // Of the single-department patients, how many have a suggestion from the
      // clinic's common pairs — the actual size of the cross-sell list.
      withSuggestion: singleDepartment.filter(r => r.suggestions.length > 0).length,
    },
    pairs: COMMON_PAIRS.map(([a, b]) => `${a} + ${b}`),
  })
}
