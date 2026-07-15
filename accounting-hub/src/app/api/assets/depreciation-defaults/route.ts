import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']

const VALID_CLASSIFICATIONS = ['2020', '2030', '2040', '2050', '2060', '2070', '2080', '2090', '2100']
const VALID_YEARS = [3, 5, 10]

/**
 * GET /api/assets/depreciation-defaults
 * Returns { classification: years } for all 9 asset classifications.
 * Missing rows default to 5 years.
 */
export async function GET() {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const rows = await prisma.assetDepreciationSetting.findMany()
  const defaults: Record<string, number> = {}
  for (const c of VALID_CLASSIFICATIONS) {
    defaults[c] = 5 // default
  }
  for (const row of rows) {
    defaults[row.classification] = row.years
  }
  return NextResponse.json(defaults)
}

/**
 * PUT /api/assets/depreciation-defaults
 * Body: { "2020": 10, "2030": 5, ... }
 * Upserts depreciation years for each classification.
 */
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }

  try {
    const body = await req.json() as Record<string, number>

    await Promise.all(
      Object.entries(body)
        .filter(([classification, years]) =>
          VALID_CLASSIFICATIONS.includes(classification) && VALID_YEARS.includes(Number(years))
        )
        .map(([classification, years]) =>
          prisma.assetDepreciationSetting.upsert({
            where: { classification },
            update: { years: Number(years) },
            create: { classification, years: Number(years) },
          })
        )
    )

    // Return updated defaults
    const rows = await prisma.assetDepreciationSetting.findMany()
    const defaults: Record<string, number> = {}
    for (const c of VALID_CLASSIFICATIONS) defaults[c] = 5
    for (const row of rows) defaults[row.classification] = row.years
    return NextResponse.json(defaults)
  } catch {
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
