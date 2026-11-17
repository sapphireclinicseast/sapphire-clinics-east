// Parked GL cancellation fees — fees no guarantee letter had room for, waiting
// for the patient's next letter (lib/pos/parked-gl-charges). GET lists them
// (still parked by default; ?status=ALL for the history, ?patientId= for one).
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || 'PARKED'
  const patientId = searchParams.get('patientId') || undefined
  const rows = await prisma.parkedGlCharge.findMany({
    where: { ...(status === 'ALL' ? {} : { status }), ...(patientId ? { patientId } : {}) },
    orderBy: [{ patientName: 'asc' }, { eventDate: 'asc' }],
  })
  return NextResponse.json({
    charges: rows.map(r => ({ ...r, amount: Number(r.amount) })),
    total: rows.reduce((s, r) => s + Number(r.amount), 0),
  })
}
