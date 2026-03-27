import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const settings = await prisma.clinicianSettings.findUnique({
    where: { therapistAccountId: session.user.id },
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
