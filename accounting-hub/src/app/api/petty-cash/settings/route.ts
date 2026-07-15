import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { branchAllowed } from '@/lib/branch-scope'

const WRITE_ROLES = ['ADMIN', 'ACCOUNTANT', 'BOOKKEEPER', 'AHEA_ADMIN', 'AHGH_ADMIN', 'VERDANA_ADMIN']
const VALID_BRANCHES = ['SANDBOX_EAST', 'SANDBOX_GREENHILLS', 'VERDANA_STORE', 'CEO']

// Seed requestor list (from the 2026 Petty Cash workbook). Used the first
// time a branch's settings are created; fully editable afterwards.
const SEED_REQUESTORS = [
  'NORMINA BOTICARIO', 'EUGENIA REYES', 'JULIE ANN OSORIO', 'JAHZEEL VILLANUEVA',
  'DENISE SALAO', 'JAN DE ASIS', 'JHEWERVY ROSARIO', 'AGATHA ESCOBAR',
  'FRANSESCA SANTOS', 'KIMBERLY SIBAL', 'FREDNICK LUIS ASISTIO', 'JOHN ALFIE REMAPILLO',
  'JENEVIE SOLAR', 'LEA DUAG', 'AMIE CASIBO', 'ANGERI DE BORJA',
]

// GET /api/petty-cash/settings?branch=SANDBOX_EAST
export async function GET(req: Request) {
  const session = await auth()
  if (!session?.user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const branch = new URL(req.url).searchParams.get('branch') || ''
  if (!VALID_BRANCHES.includes(branch)) {
    return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
  }

  let settings = await prisma.pettyCashSettings.findUnique({ where: { branch } })
  if (!settings) {
    settings = await prisma.pettyCashSettings.create({
      data: { branch, nextPcvSeq: 1, requestors: SEED_REQUESTORS },
    })
  }
  return NextResponse.json(settings)
}

// PUT /api/petty-cash/settings  { branch, nextPcvSeq?, requestors? }
export async function PUT(req: Request) {
  const session = await auth()
  if (!session?.user || !WRITE_ROLES.includes(session.user.role as string)) {
    return NextResponse.json({ error: 'Insufficient permissions' }, { status: 403 })
  }
  try {
    const { branch, nextPcvSeq, requestors, prepaidAccount } = await req.json()
    if (!VALID_BRANCHES.includes(branch)) {
      return NextResponse.json({ error: 'Valid branch is required' }, { status: 400 })
    }
    if (!branchAllowed((session.user as { branch?: string }).branch, branch)) {
      return NextResponse.json({ error: 'Access denied for this branch' }, { status: 403 })
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data: any = {}
    if (nextPcvSeq !== undefined) {
      const n = parseInt(String(nextPcvSeq), 10)
      if (isNaN(n) || n < 1) return NextResponse.json({ error: 'Start number must be a positive integer' }, { status: 400 })
      data.nextPcvSeq = n
    }
    if (requestors !== undefined) {
      if (!Array.isArray(requestors)) return NextResponse.json({ error: 'requestors must be an array' }, { status: 400 })
      data.requestors = requestors.map((r: unknown) => String(r).trim()).filter(Boolean)
    }
    if (prepaidAccount !== undefined) data.prepaidAccount = prepaidAccount ? String(prepaidAccount) : null
    const settings = await prisma.pettyCashSettings.upsert({
      where: { branch },
      update: data,
      create: { branch, nextPcvSeq: data.nextPcvSeq ?? 1, requestors: data.requestors ?? SEED_REQUESTORS },
    })
    return NextResponse.json(settings)
  } catch (e) {
    console.error('Petty cash settings error:', e)
    return NextResponse.json({ error: 'Failed to save settings' }, { status: 500 })
  }
}
