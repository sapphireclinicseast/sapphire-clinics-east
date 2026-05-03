import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

type DayHours = { open: boolean; openTime: string; closeTime: string }

const DEFAULT_SBEA: Record<string, DayHours> = {
  MON: { open: true,  openTime: '10:00', closeTime: '20:00' },
  TUE: { open: true,  openTime: '10:00', closeTime: '20:00' },
  WED: { open: true,  openTime: '10:00', closeTime: '20:00' },
  THU: { open: true,  openTime: '10:00', closeTime: '20:00' },
  FRI: { open: true,  openTime: '10:00', closeTime: '20:00' },
  SAT: { open: true,  openTime: '10:00', closeTime: '20:00' },
  SUN: { open: false, openTime: '10:00', closeTime: '20:00' },
}

const DEFAULT_SBGH: Record<string, DayHours> = {
  MON: { open: true,  openTime: '09:00', closeTime: '19:00' },
  TUE: { open: true,  openTime: '09:00', closeTime: '19:00' },
  WED: { open: true,  openTime: '09:00', closeTime: '19:00' },
  THU: { open: true,  openTime: '09:00', closeTime: '19:00' },
  FRI: { open: true,  openTime: '09:00', closeTime: '19:00' },
  SAT: { open: true,  openTime: '09:00', closeTime: '19:00' },
  SUN: { open: false, openTime: '09:00', closeTime: '19:00' },
}

const DEFAULTS: Record<string, Record<string, DayHours>> = {
  SBEA: DEFAULT_SBEA,
  SBGH: DEFAULT_SBGH,
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const records = await prisma.deckingClinicHours.findMany()
  const result: Record<string, unknown> = {}
  for (const branch of ['SBEA', 'SBGH']) {
    const found = records.find(r => r.id === branch)
    result[branch] = found?.schedule ?? DEFAULTS[branch]
  }
  return NextResponse.json(result)
}

export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { branch, schedule } = await req.json()
  if (!branch || !schedule)
    return NextResponse.json({ error: 'branch and schedule are required' }, { status: 400 })

  const record = await prisma.deckingClinicHours.upsert({
    where: { id: branch },
    create: { id: branch, schedule },
    update: { schedule },
  })
  return NextResponse.json(record)
}
