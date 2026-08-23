// GET /api/aurora-admin/users — admin view of patients who have a portal
// account (passwordHash set), grouped by branch. Server-to-server auth via the
// shared AURORA_ADMIN_TOKEN (injected by the client-portal admin proxy).
//
// SECURITY: passwords are stored as one-way bcrypt hashes and are NEVER
// returned here — only email + username + account status. There is no way to
// recover a plaintext password from the hash.

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { checkAdminToken } from '@/lib/aurora-admin'
import { branchLabel } from '@/lib/branch-label'

function titleCase(s: string): string {
  return s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()).trim()
}

interface UserRow {
  id: string
  name: string
  email: string | null
  username: string | null
  createdAt: string
  lastSession: string | null
  sessionCount: number
}
interface BranchGroup {
  branch: string
  branchLabel: string
  users: UserRow[]
}

export async function GET(req: NextRequest) {
  if (!checkAdminToken(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const branchQ = new URL(req.url).searchParams.get('branch')
  const where: { passwordHash: { not: null }; branches?: { has: 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' } } = {
    passwordHash: { not: null },
  }
  if (branchQ === 'SANDBOX_EAST' || branchQ === 'SANDBOX_GREENHILLS') where.branches = { has: branchQ }

  const patients = await prisma.patient.findMany({
    where,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true, firstName: true, lastName: true, email: true, username: true,
      branch: true, branches: true, createdAt: true,
    },
  })

  // Count sessions across ALL of a patient's interbranch records (same email +
  // first + last name), matching what the portal shows via linkedPatientIds —
  // otherwise an East login would miss its Greenhills sessions. The count uses
  // the portal's "total" definition: CONFIRMED + CANCELLED + RESCHEDULED
  // (PENDING excluded); LAST SESSION is the most recent CONFIRMED date.
  const idKey = (p: { email: string | null; firstName: string; lastName: string }) =>
    `${(p.email ?? '').toLowerCase().trim()}|${p.firstName.toLowerCase().trim()}|${p.lastName.toLowerCase().trim()}`
  const identityRecords = await prisma.patient.findMany({
    select: { id: true, email: true, firstName: true, lastName: true },
  })
  const idsByIdentity = new Map<string, string[]>()
  for (const r of identityRecords) {
    if (!r.email || !r.email.trim()) continue
    const k = idKey(r)
    const arr = idsByIdentity.get(k)
    if (arr) arr.push(r.id)
    else idsByIdentity.set(k, [r.id])
  }
  const linkedOf = (p: { id: string; email: string | null; firstName: string; lastName: string }) =>
    p.email && p.email.trim() ? (idsByIdentity.get(idKey(p)) ?? [p.id]) : [p.id]

  const unionIds = [...new Set(patients.flatMap(linkedOf))]
  const [counts, lasts] = await Promise.all([
    prisma.schedule.groupBy({
      by: ['patientId'],
      where: { patientId: { in: unionIds }, status: { in: ['CONFIRMED', 'CANCELLED', 'RESCHEDULED'] } },
      _count: { _all: true },
    }),
    prisma.schedule.groupBy({
      by: ['patientId'],
      where: { patientId: { in: unionIds }, status: 'CONFIRMED' },
      _max: { date: true },
    }),
  ])
  const countByPid = new Map(counts.map((c) => [c.patientId, c._count._all]))
  const lastByPid = new Map(lasts.map((c) => [c.patientId, c._max.date]))

  const order = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']
  const groups = new Map<string, BranchGroup>()
  for (const p of patients) {
    const b = p.branches?.[0] ?? p.branch
    const key = b ?? 'UNASSIGNED'
    let g = groups.get(key)
    if (!g) {
      g = {
        branch: key,
        branchLabel: b ? (branchLabel(b) ?? b) : 'Unassigned',
        users: [],
      }
      groups.set(key, g)
    }
    const ids = linkedOf(p)
    const sessionCount = ids.reduce((n, id) => n + (countByPid.get(id) ?? 0), 0)
    const lastDates = ids
      .map((id) => lastByPid.get(id))
      .filter((d): d is Date => !!d)
    const lastSession = lastDates.length
      ? new Date(Math.max(...lastDates.map((d) => d.getTime()))).toISOString().slice(0, 10)
      : null
    g.users.push({
      id: p.id,
      name: titleCase(`${p.firstName} ${p.lastName}`),
      email: p.email,
      username: p.username,
      createdAt: p.createdAt.toISOString().slice(0, 10),
      lastSession,
      sessionCount,
    })
  }

  const branches = [...groups.values()].sort((a, b) => {
    const ia = order.indexOf(a.branch)
    const ib = order.indexOf(b.branch)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return NextResponse.json({ branches, totalUsers: patients.length })
}
