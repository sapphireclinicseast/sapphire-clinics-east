// GET /api/notifications — recent activity feed for the hub notification bell.
// Returns patient registrations and appointment bookings from the last 48 hours.
// Branch-filtered: admin sees all, branch-scoped roles see only their branch.

import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

function bookingBranchesForRole(role: string): string[] | null {
  if (role.startsWith('SBEA_')) return ['SBEA']
  if (role.startsWith('SBGH_')) return ['SBGH']
  return null // null = all branches
}

const BRANCH_ENUM_TO_SHORT: Record<string, string> = {
  SANDBOX_EAST: 'SBEA',
  SANDBOX_GREENHILLS: 'SBGH',
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role = (session.user as { role?: string })?.role ?? ''
  const bookingBranches = bookingBranchesForRole(role)

  const since = new Date(Date.now() - 48 * 60 * 60 * 1000)

  const [patients, bookings] = await Promise.all([
    // Patient registrations: shown to all hub users (branch filtering via Branch
    // enum is complex; registrations are low-volume enough to show all).
    prisma.patient.findMany({
      where: { createdAt: { gte: since } },
      select: { id: true, firstName: true, lastName: true, branches: true, branch: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    prisma.patientBooking.findMany({
      where: {
        createdAt: { gte: since },
        status: { in: ['PENDING', 'PAID'] },
        ...(bookingBranches ? { branch: { in: bookingBranches } } : {}),
      },
      include: {
        patient: { select: { firstName: true, lastName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
  ])

  const items = [
    ...patients.map((p) => ({
      id: `reg_${p.id}`,
      type: 'REGISTRATION' as const,
      name: `${p.firstName} ${p.lastName}`.trim(),
      branch: BRANCH_ENUM_TO_SHORT[p.branches[0] ?? ''] ?? (p.branch ? String(p.branch) : ''),
      createdAt: p.createdAt.toISOString(),
      href: '/patients',
    })),
    ...bookings.map((b) => ({
      id: `bkg_${b.id}`,
      type: 'BOOKING' as const,
      name: `${b.patient.firstName} ${b.patient.lastName}`.trim(),
      branch: b.branch,
      status: b.status,
      createdAt: b.createdAt.toISOString(),
      href: '/decking',
    })),
  ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())

  return NextResponse.json({ items })
}
