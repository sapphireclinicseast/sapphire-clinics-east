import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionClinicId } from '@/lib/auth'

// Clinic updates its business details.
export async function PATCH(req: NextRequest) {
  const cid = await getSessionClinicId()
  if (!cid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>
  const data: Record<string, unknown> = {}
  ;['name', 'contactPerson', 'phone', 'tin', 'address', 'city'].forEach((k) => { if (b[k] !== undefined) data[k] = b[k] === null || b[k] === '' ? null : String(b[k]).slice(0, 200) })
  if (typeof b.businessType === 'string' && ['SOLE_PROP', 'PARTNERSHIP', 'CORPORATION'].includes(b.businessType)) data.businessType = b.businessType
  await prisma.clinic.update({ where: { id: cid }, data })
  return NextResponse.json({ ok: true })
}
