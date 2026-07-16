import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Managing referred patients: everyone who manages referrers (all roles except HMO Officer / MedRep read-only via referrers panel).
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN', 'AHEA_FRONTDESK', 'AHGH_FRONTDESK', 'MEDREP']

// GET → list referred patients (with referrer name). Optional ?search / ?referrerId.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { searchParams } = new URL(req.url)
  const search = (searchParams.get('search') || '').trim()
  const referrerId = searchParams.get('referrerId') || ''

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const where: any = {}
  if (referrerId) where.referrerId = referrerId
  if (search) where.OR = [
    { patientName: { contains: search, mode: 'insensitive' } },
    { referrer: { name: { contains: search, mode: 'insensitive' } } },
  ]

  const rows = await prisma.referredPatient.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    include: { referrer: { select: { id: true, name: true, type: true } } },
  })
  return NextResponse.json(rows.map(r => ({
    id: r.id, patientId: r.patientId, patientName: r.patientName, note: r.note,
    referrerId: r.referrerId, referrerName: r.referrer?.name || '—', referrerType: r.referrer?.type || null,
    createdAt: r.createdAt,
  })))
}

// POST { referrerId, patientName, patientId?, note? }
export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  try {
    const { referrerId, patientName, patientId, note } = await req.json()
    if (!referrerId) return NextResponse.json({ error: 'Select a referrer' }, { status: 400 })
    if (!patientName?.trim()) return NextResponse.json({ error: 'Select a patient' }, { status: 400 })

    const referrer = await prisma.referrer.findUnique({ where: { id: referrerId }, select: { id: true } })
    if (!referrer) return NextResponse.json({ error: 'Referrer not found' }, { status: 400 })

    // Avoid duplicate (same referrer + same patient).
    const dupe = await prisma.referredPatient.findFirst({
      where: { referrerId, OR: [{ patientId: patientId || undefined }, { patientName: { equals: patientName.trim(), mode: 'insensitive' } }] },
      select: { id: true },
    })
    if (dupe) return NextResponse.json({ error: 'This patient is already linked to that referrer' }, { status: 409 })

    const created = await prisma.referredPatient.create({
      data: { referrerId, patientName: patientName.trim(), patientId: patientId || null, note: note?.trim() || null, createdById: session.user.id ?? null },
    })
    return NextResponse.json({ ok: true, id: created.id }, { status: 201 })
  } catch (e) {
    console.error('referred-patients POST error:', e)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// DELETE ?id=
export async function DELETE(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  const id = new URL(req.url).searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 })
  await prisma.referredPatient.delete({ where: { id } }).catch(() => {})
  return NextResponse.json({ ok: true })
}
