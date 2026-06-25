import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

/** Branch-specific roles see their branch + Verdana Store */
function allowedBranches(role: string): string[] | null {
  if (role.startsWith('SBEA_')) return ['SBEA', 'VDNA']
  if (role.startsWith('SBGH_')) return ['SBGH', 'VDNA']
  return null // ADMIN / MARKETING_ADMIN — no restriction
}

export async function GET() {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role    = (session.user as { role?: string }).role ?? ''
  const allowed = allowedBranches(role)

  const staff = await prisma.staff.findMany({
    where:   { active: true, ...(allowed ? { branch: { in: allowed } } : {}) },
    orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
  })
  return NextResponse.json(staff)
}

// Staff creation is disabled — staff data is synced from the HR Platform
export async function POST() {
  return NextResponse.json(
    { error: 'Staff creation is disabled. Staff data is synced from the HR Platform.' },
    { status: 403 }
  )
}

// Narrow PATCH endpoint: admin/front-desk may set sex on a Staff record,
// since the HR Platform does not track this field. Everything else still
// flows one-way from HR.
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN', 'SBEA_FRONT_DESK', 'SBGH_FRONT_DESK'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as { id?: string; sex?: string | null }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const sexIn = (body.sex ?? '').toString().trim().toUpperCase()
  const sex = sexIn === 'M' || sexIn === 'MALE' ? 'M' : sexIn === 'F' || sexIn === 'FEMALE' ? 'F' : null

  const updated = await prisma.staff.update({
    where: { id: body.id },
    data: { sex },
    select: { id: true, sex: true },
  })
  return NextResponse.json(updated)
}

export async function PUT() {
  return NextResponse.json(
    { error: 'Staff editing is disabled. Update staff profiles in the HR Platform.' },
    { status: 403 }
  )
}

export async function DELETE() {
  return NextResponse.json(
    { error: 'Staff deletion is disabled. Manage staff profiles in the HR Platform.' },
    { status: 403 }
  )
}
