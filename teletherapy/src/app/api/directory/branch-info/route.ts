import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCHES = ['EAST', 'GREENHILLS', 'VERDANA', 'CORPORATE'] as const

function isAdmin(role?: string) {
  return role === 'ADMIN'
}

// GET — per-branch info, visible to every signed-in user.
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  // @ts-ignore — directoryBranchInfo not in typings until generate
  const rows = await prisma.directoryBranchInfo.findMany()
  const byBranch: Record<string, string> = {}
  for (const r of rows as { branch: string; info: string | null }[]) {
    byBranch[r.branch] = r.info ?? ''
  }
  const info = BRANCHES.map((b) => ({ branch: b, info: byBranch[b] ?? '' }))
  return NextResponse.json({ info, branches: BRANCHES })
}

// PUT — upsert the info text for one branch (admin only).
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const body = await req.json()
  const branch = typeof body.branch === 'string' ? body.branch : ''
  if (!(BRANCHES as readonly string[]).includes(branch)) {
    return NextResponse.json({ error: 'Invalid branch' }, { status: 400 })
  }
  const info = typeof body.info === 'string' ? body.info : ''

  // @ts-ignore
  const row = await prisma.directoryBranchInfo.upsert({
    where: { branch },
    update: { info, updatedById: session.user.id },
    create: { branch, info, updatedById: session.user.id },
  })
  return NextResponse.json({ entry: row })
}
