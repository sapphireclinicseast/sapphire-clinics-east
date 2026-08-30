import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'

// Patient cancels one of their open requests.
export async function POST(req: NextRequest) {
  const patientId = await getSessionPatientId()
  if (!patientId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { requestId?: string }
  const requestId = String(b.requestId ?? '')
  const r = await prisma.patientRequest.findFirst({ where: { id: requestId, patientId }, select: { id: true, status: true } })
  if (!r) return NextResponse.json({ error: 'Request not found' }, { status: 404 })
  if (r.status !== 'OPEN') return NextResponse.json({ error: 'This request can’t be cancelled.' }, { status: 409 })
  await prisma.$transaction([
    prisma.requestOffer.updateMany({ where: { requestId, status: 'PENDING' }, data: { status: 'WITHDRAWN' } }),
    prisma.patientRequest.update({ where: { id: requestId }, data: { status: 'CANCELLED' } }),
  ])
  return NextResponse.json({ ok: true })
}
