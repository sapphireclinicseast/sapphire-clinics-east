import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  // An intern isn't licensed, so a note they write must carry the SUPERVISOR's
  // licence + signature. When the session page passes ?scheduleId= and the
  // caller is the intern assigned to that session, return the supervising
  // clinician's settings (the session's staffId) instead of the intern's own.
  let targetAccountId = session.user.id
  const scheduleId = (req.nextUrl.searchParams.get('scheduleId') ?? '').trim()
  if (scheduleId && session.user.accountType === 'INTERN') {
    const sched = await prisma.schedule.findUnique({
      where: { id: scheduleId },
      select: { staffId: true, internStaffId: true },
    })
    if (sched?.staffId && sched.internStaffId === session.user.staffId) {
      const supervisorAccount = await prisma.therapistAccount.findFirst({
        where: { staffId: sched.staffId },
        select: { id: true },
      })
      if (supervisorAccount) targetAccountId = supervisorAccount.id
    }
  }

  const settings = await prisma.clinicianSettings.findUnique({
    where: { therapistAccountId: targetAccountId },
  })

  return NextResponse.json({ settings: settings ?? null })
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { licenseNo, ptrNo, signatureDataUrl } = body

  const settings = await prisma.clinicianSettings.upsert({
    where: { therapistAccountId: session.user.id },
    create: {
      therapistAccountId: session.user.id,
      licenseNo: licenseNo ?? null,
      ptrNo: ptrNo ?? null,
      signatureDataUrl: signatureDataUrl ?? null,
    },
    update: {
      licenseNo: licenseNo ?? null,
      ptrNo: ptrNo ?? null,
      signatureDataUrl: signatureDataUrl ?? null,
    },
  })

  return NextResponse.json({ settings })
}
