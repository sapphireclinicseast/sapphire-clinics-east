import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Field map: [branch][dept] → DB column name
const FIELD: Record<string, Record<string, string>> = {
  SBEA: { OT: 'seaOt', PT: 'seaPt', SLP: 'seaSlp', SPED: 'seaSped', MD: 'seaMd', PSYCHOLOGY: 'seaPsych', ORTHOSIS: 'seaOrthosis' },
  SBGH: { OT: 'sghOt', PT: 'sghPt', SLP: 'sghSlp', SPED: 'sghSped', MD: 'sghMd', PSYCHOLOGY: 'sghPsych', ORTHOSIS: 'sghOrthosis' },
}

function rowToMaxSessions(row: Record<string, any>): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  for (const [branch, depts] of Object.entries(FIELD)) {
    out[branch] = {}
    for (const [dept, col] of Object.entries(depts)) {
      out[branch][dept] = row[col] ?? 8
    }
  }
  return out
}

export async function GET() {
  try {
    const row = await prisma.clinicCapSettings.findUnique({ where: { id: 'default' } })
    if (!row) {
      // Return defaults without inserting — upsert happens on first save
      const defaults: Record<string, Record<string, number>> = {}
      for (const [branch, depts] of Object.entries(FIELD)) {
        defaults[branch] = {}
        for (const dept of Object.keys(depts)) defaults[branch][dept] = 8
      }
      return NextResponse.json(defaults)
    }
    return NextResponse.json(rowToMaxSessions(row as any))
  } catch (e) {
    console.error('cap-settings GET', e)
    return NextResponse.json({}, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body: Record<string, Record<string, number>> = await req.json()
    const data: Record<string, number> = {}
    for (const [branch, depts] of Object.entries(FIELD)) {
      for (const [dept, col] of Object.entries(depts)) {
        const v = body[branch]?.[dept]
        data[col] = typeof v === 'number' && v >= 0 ? Math.round(v) : 8
      }
    }
    const row = await prisma.clinicCapSettings.upsert({
      where:  { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    })
    return NextResponse.json(rowToMaxSessions(row as any))
  } catch (e) {
    console.error('cap-settings POST', e)
    return NextResponse.json({ error: 'Failed to save' }, { status: 500 })
  }
}
