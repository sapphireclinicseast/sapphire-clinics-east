import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

// Cities a patient can pick = the union of cities covered by bookable providers
// (active, with a rate set and at least one availability window).
export async function GET() {
  const providers = await prisma.provider.findMany({
    where: { active: true, verificationStatus: 'VERIFIED', rate: { not: null }, slots: { some: {} } },
    select: { citiesCovered: true },
  })
  const set = new Set<string>()
  for (const p of providers) for (const c of p.citiesCovered) if (c.trim()) set.add(c.trim())
  return NextResponse.json({ cities: Array.from(set).sort((a, b) => a.localeCompare(b)) })
}
