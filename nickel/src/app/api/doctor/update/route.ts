import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionDoctorId } from '@/lib/auth'

// Doctor updates their consult offering & payout details.
export async function PATCH(req: NextRequest) {
  const did = await getSessionDoctorId()
  if (!did) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>

  const data: Record<string, unknown> = {}
  const str = (k: string) => { if (b[k] !== undefined) data[k] = b[k] === null || b[k] === '' ? null : String(b[k]).slice(0, 200) }
  ;['phone', 'prcNumber', 'ptrNumber', 'postNominals', 'specialization', 'clinicName', 'clinicAddress', 'clinicCity', 'bankName', 'bankAccountNo', 'bankAccountName', 'gcashNumber'].forEach(str)
  if (b.consultFee !== undefined) data.consultFee = b.consultFee === null || b.consultFee === '' ? null : Number(b.consultFee)
  if (typeof b.teleconsultEnabled === 'boolean') data.teleconsultEnabled = b.teleconsultEnabled
  if (typeof b.inPersonEnabled === 'boolean') data.inPersonEnabled = b.inPersonEnabled
  if (typeof b.photo === 'string' && b.photo.startsWith('data:')) data.photo = b.photo
  if (b.signature === '' || b.signature === null) data.signature = null
  else if (typeof b.signature === 'string' && b.signature.startsWith('data:')) data.signature = b.signature

  await prisma.doctor.update({ where: { id: did }, data })
  return NextResponse.json({ ok: true })
}
