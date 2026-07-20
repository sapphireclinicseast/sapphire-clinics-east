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
    where: allowed
      ? { OR: [{ branch: { in: allowed } }, { extraBranches: { hasSome: allowed } }] }
      : {},
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

// Narrow PATCH endpoint: locally-managed fields only (never overwritten by HR sync).
// - sex: any staff-facing role may set it
// - extraBranches: ADMIN only (controls which branches this consultant appears under)
export async function PATCH(req: Request) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const role = (session.user as { role?: string }).role ?? ''
  if (!['ADMIN', 'MARKETING_ADMIN', 'SBEA_ADMIN', 'SBGH_ADMIN', 'SBEA_FRONT_DESK', 'SBGH_FRONT_DESK'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    sex?: string | null
    extraBranches?: string[]
  }
  if (!body.id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  // extraBranches — ADMIN only; controls multi-branch visibility for interbranch consultants
  if ('extraBranches' in body) {
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only the Clinic Manager can assign extra branches' }, { status: 403 })
    }
    const VALID = ['SBEA', 'SBGH', 'VDNA']
    const branches = Array.isArray(body.extraBranches)
      ? body.extraBranches.filter((b): b is string => typeof b === 'string' && VALID.includes(b))
      : []
    const updated = await prisma.staff.update({
      where: { id: body.id },
      data: { extraBranches: branches },
      select: { id: true, extraBranches: true },
    })
    return NextResponse.json(updated)
  }

  // sex — any allowed role
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
