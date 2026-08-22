import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/**
 * Rent allocation percentages for the Contribution Margin analysis:
 * per branch, what % of that branch's rent (8210 + 8211) each department
 * carries. GET returns { branch: { department: pct } }; PUT replaces one
 * branch's allocation.
 */

const READ_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'VIEWER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER']
const BRANCHES = new Set(['SBEA', 'SBGH', 'VERDANA_STORE', 'AURA_INSTITUTE'])
const DEPTS = new Set(['PT', 'OT', 'SLP', 'SPED', 'MD', 'ORTHOSIS', 'PSYCHOLOGY', 'TRAINING', 'RETAIL', 'OTHER'])

export async function GET() {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role || ''
  if (!session?.user || !READ_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const rows = await prisma.contributionRentAllocation.findMany()
  const out: Record<string, Record<string, number>> = {}
  for (const r of rows) {
    if (!out[r.branch]) out[r.branch] = {}
    out[r.branch][r.department] = Number(r.pct)
  }
  return NextResponse.json({ allocations: out })
}

export async function PUT(req: Request) {
  const session = await auth()
  const role = (session?.user as { role?: string } | undefined)?.role || ''
  if (!session?.user || !WRITE_ROLES.includes(role)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  const body = await req.json().catch(() => null) as { branch?: string; allocation?: Record<string, number> } | null
  const branch = body?.branch || ''
  const allocation = body?.allocation || {}
  if (!BRANCHES.has(branch)) return NextResponse.json({ error: 'Unknown branch' }, { status: 400 })

  const entries = Object.entries(allocation)
    .map(([d, p]) => [d, Math.round(Number(p) * 100) / 100] as [string, number])
    .filter(([d, p]) => DEPTS.has(d) && Number.isFinite(p) && p > 0)
  const sum = entries.reduce((s, [, p]) => s + p, 0)
  if (sum > 100.005) {
    return NextResponse.json({ error: `Percentages total ${sum.toFixed(2)}% — they cannot exceed 100%.` }, { status: 400 })
  }

  await prisma.$transaction([
    prisma.contributionRentAllocation.deleteMany({ where: { branch } }),
    ...entries.map(([department, pct]) =>
      prisma.contributionRentAllocation.create({
        data: { id: `cra_${branch}_${department}`.toLowerCase(), branch, department, pct },
      })),
  ])
  return NextResponse.json({ ok: true, branch, saved: entries.length, sum })
}
