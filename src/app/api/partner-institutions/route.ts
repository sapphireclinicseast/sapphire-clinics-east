// GET /api/partner-institutions — list the (mirrored, read-only) partner
// institutions for the Front Desk / dashboard page. Any authenticated role
// can read this — it's not branch-scoped (a partnership isn't tied to one
// branch) and there is deliberately no POST/PUT/DELETE here: management
// stays in HR Platform, this side is view-only.
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const institutions = await prisma.partnerInstitution.findMany({
    orderBy: { name: 'asc' },
  })
  return NextResponse.json({ institutions })
}
