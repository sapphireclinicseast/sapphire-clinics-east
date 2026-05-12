import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'SBEA_ADMIN', 'SBGH_ADMIN', 'VERDANA_ADMIN']
const READ_ROLES = [...WRITE_ROLES, 'VIEWER']

function allowedBranches(role: string): string[] | null {
  if (role === 'SBEA_ADMIN') return ['SBEA', 'VERDANA']
  if (role === 'SBGH_ADMIN') return ['SBGH', 'VERDANA']
  if (role === 'VERDANA_ADMIN') return ['VERDANA']
  return null
}

// GET: Fetch adjustments for a cutoff period
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const cutoffPeriod = searchParams.get('cutoffPeriod') || ''
  const branch = searchParams.get('branch') || ''

  if (!cutoffPeriod || !branch) {
    return NextResponse.json({ error: 'Missing cutoffPeriod or branch' }, { status: 400 })
  }

  const allowed = allowedBranches(session.user.role as string)
  if (allowed && !allowed.includes(branch)) {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  const adjustments = await prisma.cutoffAdjustment.findMany({
    where: { cutoffPeriod, branch },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
    orderBy: { employee: { lastName: 'asc' } },
  })

  return NextResponse.json(adjustments)
}

// POST: Save/update adjustments (bulk upsert)
export async function POST(req: Request) {
  try {
    const session = await auth()
    if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await req.json()
    const { cutoffPeriod, branch, adjustments } = body

    if (!cutoffPeriod || !branch || !Array.isArray(adjustments)) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Filter out rows with no allowance or deduction (empty lines)
    const toCreate = adjustments
      .filter((adj: { employeeId?: string; allowance?: number; deduction?: number }) =>
        adj.employeeId && ((adj.allowance && Number(adj.allowance) > 0) || (adj.deduction && Number(adj.deduction) > 0))
      )
      .map((adj: { employeeId: string; allowance?: number; allowanceType?: string; allowanceLabel?: string; deduction?: number; deductionLabel?: string }) => ({
        employeeId: adj.employeeId,
        cutoffPeriod,
        branch,
        allowance: Number(adj.allowance) || 0,
        allowanceType: adj.allowanceType || 'NON_TAXABLE',
        allowanceLabel: adj.allowanceLabel || null,
        deduction: Number(adj.deduction) || 0,
        deductionLabel: adj.deductionLabel || null,
      }))

    // Sequential delete + recreate — no $transaction to avoid Prisma compatibility issues
    await prisma.cutoffAdjustment.deleteMany({ where: { cutoffPeriod, branch } })
    if (toCreate.length > 0) {
      await prisma.cutoffAdjustment.createMany({ data: toCreate })
    }

    return NextResponse.json({ saved: toCreate.length })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('cutoff-adjustments POST error:', msg)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// PUT: Pre-fill from previous cutoff
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !READ_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const cutoffPeriod = searchParams.get('cutoffPeriod') || ''
  const branch = searchParams.get('branch') || ''

  if (!cutoffPeriod || !branch) {
    return NextResponse.json({ error: 'Missing cutoffPeriod or branch' }, { status: 400 })
  }

  // Parse cutoff period to find previous one
  const [yearStr, monthStr, halfStr] = cutoffPeriod.split('-')
  let prevYear = parseInt(yearStr)
  let prevMonth = parseInt(monthStr)
  let prevHalf = parseInt(halfStr)

  if (prevHalf === 1) {
    // Previous is 2nd half of prior month
    prevHalf = 2
    prevMonth--
    if (prevMonth < 1) { prevMonth = 12; prevYear-- }
  } else {
    prevHalf = 1
  }

  const prevCutoff = `${prevYear}-${prevMonth}-${prevHalf}`

  const prevAdjustments = await prisma.cutoffAdjustment.findMany({
    where: { cutoffPeriod: prevCutoff, branch },
    include: {
      employee: { select: { id: true, firstName: true, lastName: true, department: true, branch: true } },
    },
  })

  return NextResponse.json({ previousCutoff: prevCutoff, adjustments: prevAdjustments })
}
