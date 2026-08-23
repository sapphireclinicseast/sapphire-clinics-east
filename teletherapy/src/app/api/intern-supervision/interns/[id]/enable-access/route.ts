/**
 * Re-enable a decked intern's portal account after the rotation lapsed (e.g. a
 * re-rotation). The supervisor of that intern, or an admin, may do this. Sets
 * internAccessOverride so the daily sweep won't turn it off again.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  const user = session.user as { role?: string; staffId?: string; branches?: { staffId: string }[] }
  const isAdmin = user.role === 'ADMIN'
  if (!isAdmin) {
    const myStaffIds = (user.branches ?? []).map((b) => b.staffId).filter(Boolean)
    const staffPool = myStaffIds.length > 0 ? myStaffIds : ([user.staffId].filter(Boolean) as string[])
    const decked = await prisma.schedule.findFirst({ where: { internStaffId: id, staffId: { in: staffPool } }, select: { id: true } })
    if (!decked) return NextResponse.json({ error: 'You do not supervise this intern.' }, { status: 403 })
  }

  const account = await prisma.therapistAccount.findFirst({ where: { staffId: id }, select: { id: true } })
  if (!account) return NextResponse.json({ error: 'This intern has no portal account.' }, { status: 404 })

  await prisma.therapistAccount.update({
    where: { id: account.id },
    data: { isActive: true, internAccessOverride: true },
  })
  return NextResponse.json({ success: true })
}
