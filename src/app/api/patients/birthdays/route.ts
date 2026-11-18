import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchForRole } from '@/lib/role-branch'

// Branch lock, via the shared helper.
//
// This used to test role.startsWith('SBEA_') inline. The Role enum is
// AHEA_*/AHGH_*, so that matched NOTHING: the lock returned null for every
// real account and this route ran unscoped for years. branchForRole knows
// both spellings — always use it rather than writing the prefix out again.
function branchFromRole(role: string): string | null {
  const b = branchForRole(role)
  return b === 'SBEA' ? 'SANDBOX_EAST' : b === 'SBGH' ? 'SANDBOX_GREENHILLS' : null
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role       = (session.user as { role?: string }).role ?? ''
  const branchLock = branchFromRole(role)

  // Fetch all patients with dob set
  const patients = await prisma.patient.findMany({
    where: { dob: { not: null } },
    select: { id: true, firstName: true, lastName: true, dob: true, phone: true, branches: true },
  })

  // Build the window: today through today+6 (7 days)
  const now = new Date()
  const window: { month: number; day: number; dateStr: string }[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(now)
    d.setDate(d.getDate() + i)
    window.push({ month: d.getMonth() + 1, day: d.getDate(), dateStr: d.toISOString().split('T')[0] })
  }

  const celebrants = patients
    .filter(p => {
      // Branch scope
      if (branchLock && !p.branches.includes(branchLock as any)) return false
      const dob = p.dob!
      const m = dob.getUTCMonth() + 1
      const d = dob.getUTCDate()
      return window.some(w => w.month === m && w.day === d)
    })
    .map(p => {
      const m = p.dob!.getUTCMonth() + 1
      const d = p.dob!.getUTCDate()
      // Find which date this year their birthday falls on
      const match = window.find(w => w.month === m && w.day === d)!
      return {
        id:         p.id,
        firstName:  p.firstName,
        lastName:   p.lastName,
        phone:      p.phone,
        branches:   p.branches,
        birthdayDate: match.dateStr,  // YYYY-MM-DD of upcoming birthday
        isToday:    match.dateStr === window[0].dateStr,
      }
    })
    .sort((a, b) => a.birthdayDate.localeCompare(b.birthdayDate))

  return NextResponse.json(celebrants)
}
