// GET /api/public/ugat/options
// Public — feeds the signup form's School / Program / Preferred-field
// dropdowns. Returns only enabled options, ordered alphabetically by label.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await prisma.ugatOption.findMany({
      where: { disabledAt: null },
      orderBy: [{ label: 'asc' }],
      select: { kind: true, label: true },
    })
    const pick = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.label)
    const legacy = pick('SCHOOL')
    // Per-track school lists; fall back to the legacy single list if a track
    // list hasn't been populated yet (e.g. right after the split migration).
    const schoolsAral = pick('SCHOOL_ARAL')
    const schoolsTindig = pick('SCHOOL_TINDIG')
    return NextResponse.json({
      schoolsAral: schoolsAral.length ? schoolsAral : legacy,
      schoolsTindig: schoolsTindig.length ? schoolsTindig : legacy,
      schools: legacy, // legacy field, kept for backward compatibility
      programs: pick('PROGRAM'),
      fields: pick('FIELD'),
    })
  } catch {
    return NextResponse.json({ schoolsAral: [], schoolsTindig: [], schools: [], programs: [], fields: [] })
  }
}
