import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const now = new Date()
  await prisma.userNotificationState.upsert({
    where:  { userId: session.user.id },
    update: { dismissedAt: now },
    create: { userId: session.user.id, dismissedAt: now },
  })

  return NextResponse.json({ ok: true })
}
