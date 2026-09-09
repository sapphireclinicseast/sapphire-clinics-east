// GET /api/decking/staff — the roster the Decking board draws its rows from.
//
// This exists because /api/staff is branch-scoped: a branch account gets its
// OWN branch's staff and nothing else. That is right for the Staff module, but
// it silently emptied the other branch's Decking board — the board offered a
// tab for Greenhills, the server allowed teletherapy to be booked there, and
// front desk still saw "No SLP staff in Greenhills Branch" because the roster
// never arrived. Cross-branch coordination is the whole point of that tab.
//
// So the scope is widened HERE and only here, and only to the columns a
// schedule grid needs: who they are, what they do, where, and how they deliver
// it. Contact details, employment terms and everything else on Staff stay
// behind /api/staff's branch scoping — /api/staff returns whole rows, which is
// exactly why this could not just relax that route's filter.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const staff = await prisma.staff.findMany({
    where: { active: true },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      department: true,
      branch: true,
      extraBranches: true,
      // Interns are filtered off the board client-side; the flag has to travel
      // for that to still work.
      employmentType: true,
      // Drives which service section a consultant appears under. The per-branch
      // value is authoritative and differs from the staff-level one for most of
      // the roster — see arrangementFor().
      workArrangement: true,
      branchEmployment: true,
    },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })

  return NextResponse.json(staff)
}
