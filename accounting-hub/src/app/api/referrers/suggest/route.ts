import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// GET ?patientId=..&patientName=.. → the referrer this patient came through,
// for pre-filling the POS Doctor Referral field. The explicit Referred-patients
// link wins; otherwise the patient's most recent order that named a referrer.
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const sp = new URL(req.url).searchParams
  const patientId = (sp.get('patientId') || '').trim()
  const patientName = (sp.get('patientName') || '').trim()
  if (!patientId && !patientName) return NextResponse.json(null)

  // Orders that predate CRM ids only carry the name, so both lookups match on
  // either key — the id when we have it, exact name (case-insensitive) as fallback.
  const patientMatch = [
    ...(patientId ? [{ patientId }] : []),
    ...(patientName ? [{ patientName: { equals: patientName, mode: 'insensitive' as const } }] : []),
  ]

  const link = await prisma.referredPatient.findFirst({
    where: { OR: patientMatch },
    orderBy: { createdAt: 'desc' },
    select: { referrer: { select: { id: true, name: true, type: true, isActive: true } } },
  })
  if (link?.referrer?.isActive) {
    const { id, name, type } = link.referrer
    return NextResponse.json({ referrerId: id, name, type, source: 'linked' })
  }

  const order = await prisma.order.findFirst({
    where: { referrerId: { not: null }, status: { notIn: ['VOIDED'] }, OR: patientMatch },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true, referrer: { select: { id: true, name: true, type: true, isActive: true } } },
  })
  if (order?.referrer?.isActive) {
    const { id, name, type } = order.referrer
    return NextResponse.json({ referrerId: id, name, type, source: 'order', lastDate: order.createdAt })
  }

  return NextResponse.json(null)
}
