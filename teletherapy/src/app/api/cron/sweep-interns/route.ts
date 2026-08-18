/**
 * Daily sweep: disable intern portal accounts whose clinical rotation has
 * lapsed by more than ROTATION_GRACE_DAYS (15). Accounts a human re-enabled
 * (internAccessOverride) are skipped. Triggered by a system cron with the
 * x-cron-secret header, or manually by an admin session.
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { fetchHrRotationMap, isRotationLapsed } from '@/lib/intern-access'

export async function POST(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  const headerSecret = req.headers.get('x-cron-secret')
  let authorized = !!secret && headerSecret === secret
  if (!authorized) {
    const session = await auth()
    authorized = session?.user?.role === 'ADMIN'
  }
  if (!authorized) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rotationMap = await fetchHrRotationMap()
  if (rotationMap.size === 0) {
    return NextResponse.json({ error: 'HR unavailable — no sweep performed', disabled: 0 }, { status: 502 })
  }

  // Active intern accounts that haven't been manually kept on.
  const accounts = await prisma.therapistAccount.findMany({
    where: {
      isActive: true,
      internAccessOverride: false,
      OR: [{ accountType: 'INTERN' }, { staff: { employmentType: 'intern' } }],
    },
    select: { id: true, staff: { select: { firstName: true, lastName: true, hrPlatformId: true } } },
  })

  const now = Date.now()
  const toDisable = accounts.filter((a) => {
    const hrId = a.staff?.hrPlatformId
    if (!hrId || !rotationMap.has(hrId)) return false // no HR rotation date -> leave alone
    return isRotationLapsed(rotationMap.get(hrId), now)
  })

  if (toDisable.length > 0) {
    await prisma.therapistAccount.updateMany({
      where: { id: { in: toDisable.map((a) => a.id) } },
      data: { isActive: false },
    })
  }

  return NextResponse.json({
    disabled: toDisable.length,
    names: toDisable.map((a) => `${a.staff?.firstName} ${a.staff?.lastName}`),
  })
}
