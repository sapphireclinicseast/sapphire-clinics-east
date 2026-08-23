/**
 * An intern's own Learning Outcomes & Preferences (get + save). One editable
 * profile per intern. The matching supervisor view is at
 * /api/intern-supervision/learning-profiles.
 */
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

async function currentStaffId(accountId: string) {
  const acct = await prisma.therapistAccount.findUnique({
    where: { id: accountId },
    include: { staff: { select: { id: true } } },
  })
  return acct?.staff?.id ?? null
}

export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const staffId = await currentStaffId(session.user.id)
  if (!staffId) return NextResponse.json({ error: 'No staff record' }, { status: 400 })

  // @ts-ignore — learningProfile
  const row = await prisma.learningProfile.findUnique({ where: { internStaffId: staffId } })
  return NextResponse.json({ profile: row?.data ?? null, updatedAt: row?.updatedAt ?? null })
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.accountType !== 'INTERN') {
    return NextResponse.json({ error: 'Only interns can fill this out.' }, { status: 403 })
  }
  const staffId = await currentStaffId(session.user.id)
  if (!staffId) return NextResponse.json({ error: 'No staff record' }, { status: 400 })

  const data = await req.json().catch(() => null)
  if (!data || typeof data !== 'object') return NextResponse.json({ error: 'Invalid body' }, { status: 400 })

  // @ts-ignore — learningProfile
  const saved = await prisma.learningProfile.upsert({
    where: { internStaffId: staffId },
    create: { internStaffId: staffId, data },
    update: { data },
  })
  return NextResponse.json({ profile: saved.data, updatedAt: saved.updatedAt })
}
