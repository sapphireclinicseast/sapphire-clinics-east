import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSessionPatientId } from '@/lib/auth'

// Patient updates their own profile (currently: profile photo shown to their therapist).
export async function PATCH(req: NextRequest) {
  const pid = await getSessionPatientId()
  if (!pid) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })
  const b = (await req.json().catch(() => ({}))) as { photo?: string | null }
  const data: Record<string, unknown> = {}
  if (b.photo === null || b.photo === '') data.photo = null
  else if (typeof b.photo === 'string' && b.photo.startsWith('data:')) {
    if (b.photo.length > 4_000_000) return NextResponse.json({ error: 'Photo too large (max ~3 MB).' }, { status: 413 })
    data.photo = b.photo
  }
  if (Object.keys(data).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  await prisma.patient.update({ where: { id: pid }, data })
  return NextResponse.json({ ok: true })
}
