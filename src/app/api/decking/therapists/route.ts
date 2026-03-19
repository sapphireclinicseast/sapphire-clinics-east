import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const branch = searchParams.get('branch')

  const configs = await prisma.deckingTherapistConfig.findMany({
    where: branch ? { branch } : {},
  })
  return NextResponse.json(configs)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { staffId, workDays, startTime, endTime, useDefault, branch, department } = await req.json()
  if (!staffId) return NextResponse.json({ error: 'staffId is required' }, { status: 400 })

  const config = await prisma.deckingTherapistConfig.upsert({
    where: { staffId },
    create: {
      staffId,
      workDays: workDays ?? [],
      startTime: startTime ?? '10:00',
      endTime: endTime ?? '20:00',
      useDefault: useDefault ?? true,
      branch: branch ?? '',
      department: department ?? '',
    },
    update: { workDays, startTime, endTime, useDefault, branch, department },
  })
  return NextResponse.json(config)
}
