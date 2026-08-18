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
  const where: { passwordHash: { not: null }; branch?: 'SANDBOX_EAST' | 'SANDBOX_GREENHILLS' } = {
    passwordHash: { not: null },
  }
  if (branchQ === 'SANDBOX_EAST' || branchQ === 'SANDBOX_GREENHILLS') where.branch = branchQ

  const patients = await prisma.patient.findMany({
    where,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    select: {
      id: true, firstName: true, lastName: true, email: true, username: true,
      branch: true, createdAt: true,
      schedules: {
        where: { status: { not: 'CANCELLED' } },
        orderBy: { date: 'desc' },
        select: { date: true },
      },
    },
  })

  const order = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS']
  const groups = new Map<string, BranchGroup>()
  for (const p of patients) {
    const key = p.branch ?? 'UNASSIGNED'
    let g = groups.get(key)
    if (!g) {
      g = {
        branch: key,
        branchLabel: p.branch ? (branchLabel(p.branch) ?? p.branch) : 'Unassigned',
        users: [],
      }
      groups.set(key, g)
    }
    g.users.push({
      id: p.id,
      name: titleCase(`${p.firstName} ${p.lastName}`),
      email: p.email,
      username: p.username,
      createdAt: p.createdAt.toISOString().slice(0, 10),
      lastSession: p.schedules[0]?.date.toISOString().slice(0, 10) ?? null,
      sessionCount: p.schedules.length,
    })
  }

  const branches = [...groups.values()].sort((a, b) => {
    const ia = order.indexOf(a.branch)
    const ib = order.indexOf(b.branch)
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib)
  })

  return NextResponse.json({ branches, totalUsers: patients.length })
}
