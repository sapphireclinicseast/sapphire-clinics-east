// GET /api/branches — local synced cache of HR Platform's Branches
// Registry. Read-only; edits belong in HR Platform, not here.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const branches = await prisma.hrBranch.findMany({ orderBy: { name: 'asc' } })
  return NextResponse.json({ branches })
}
