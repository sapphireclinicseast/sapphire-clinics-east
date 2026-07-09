// GET /api/public/ugat/options
// Public — feeds the signup form's School / Program / Preferred-field
// dropdowns. Returns only enabled options, ordered by sortOrder then label.

import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const rows = await prisma.ugatOption.findMany({
      where: { disabledAt: null },
      orderBy: [{ sortOrder: 'asc' }, { label: 'asc' }],
      select: { kind: true, label: true },
    })
    const pick = (kind: string) => rows.filter((r) => r.kind === kind).map((r) => r.label)
    return NextResponse.json({
      schools: pick('SCHOOL'),
      programs: pick('PROGRAM'),
      fields: pick('FIELD'),
    })
  } catch {
    return NextResponse.json({ schools: [], programs: [], fields: [] })
  }
}
