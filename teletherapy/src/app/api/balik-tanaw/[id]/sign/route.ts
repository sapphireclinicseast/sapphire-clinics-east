/**
 * Supervisor signs an intern's Balik-Tanaw (the Coordinating Teacher's
 * signature) once they've read it. Stamps the supervisor's name + timestamp
 * (and their saved signature image, if any).
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params

  // @ts-ignore — balikTanaw
  const entry = await prisma.balikTanaw.findUnique({ where: { id } })
  if (!entry) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const user = session.user as { id: string; role?: string; staffId?: string; branches?: { staffId: string }[] }
  const isAdmin = user.role === 'ADMIN'

  // Verify this intern is decked to me (I'm their supervisor) unless admin.
  if (!isAdmin) {
    const myStaffIds = (user.branches ?? []).map((b) => b.staffId).filter(Boolean)
    const staffPool = myStaffIds.length > 0 ? myStaffIds : ([user.staffId].filter(Boolean) as string[])
    const decked = await prisma.schedule.findFirst({
      where: { internStaffId: entry.internStaffId, staffId: { in: staffPool } },
      select: { id: true },
    })
    if (!decked) return NextResponse.json({ error: 'You do not supervise this intern.' }, { status: 403 })
  }

  // Resolve my name + saved signature.
  const acct = await prisma.therapistAccount.findUnique({
    where: { id: user.id },
    include: { staff: { select: { firstName: true, lastName: true } } },
  })
  const name = acct?.staff ? `${acct.staff.firstName} ${acct.staff.lastName}` : (session.user.name ?? 'Supervisor')
  // @ts-ignore — clinicianSettings
  const settings = await prisma.clinicianSettings.findFirst({ where: { therapistAccountId: user.id } })

  // @ts-ignore — balikTanaw
  const updated = await prisma.balikTanaw.update({
    where: { id },
    data: {
      supervisorSignedName: name,
      supervisorSignedAt: new Date(),
      supervisorAccountId: user.id,
      supervisorSignatureUrl: settings?.signatureDataUrl ?? null,
    },
  })
  return NextResponse.json({ entry: updated })
}
