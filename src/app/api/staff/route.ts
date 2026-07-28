import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { Prisma } from '@prisma/client'
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
      ? { active: true, OR: [{ branch: { in: allowed } }, { extraBranches: { hasSome: allowed } }] }
      : { active: true },
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
  if (!['ADMIN', 'MARKETING_ADMIN', 'AHEA_ADMIN', 'AHGH_ADMIN', 'AHEA_FRONT_DESK', 'AHGH_FRONT_DESK'].includes(role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = (await req.json().catch(() => ({}))) as {
    id?: string
    sex?: string | null
    extraBranches?: string[]
    employmentByBranch?: Record<string, string> | null
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

  // employmentByBranch — ADMIN only. Lets one profile be a consultant at one branch and an
  // employee at another; Payroll in the Accounting Hub reads this to decide which tab the
  // person lands in per branch. Owned here, never overwritten by the HR sync.
  if ('employmentByBranch' in body) {
    if (role !== 'ADMIN') {
      return NextResponse.json({ error: 'Only the Clinic Manager can set per-branch employment' }, { status: 403 })
    }
    const VALID_BRANCH = ['SBEA', 'SBGH', 'VDNA']
    const VALID_TYPE = ['employee', 'consultant']
    const raw = body.employmentByBranch
    let value: Record<string, string> | null = null
    if (raw && typeof raw === 'object') {
      const clean: Record<string, string> = {}
      for (const [branch, type] of Object.entries(raw)) {
        if (!VALID_BRANCH.includes(branch)) {
          return NextResponse.json({ error: `Unknown branch "${branch}"` }, { status: 400 })
        }
        const t = String(type || '').toLowerCase()
        if (!t) continue                       // blank = no override for that branch
        if (!VALID_TYPE.includes(t)) {
          return NextResponse.json({ error: `Employment must be employee or consultant, got "${type}"` }, { status: 400 })
        }
        clean[branch] = t
      }
      value = Object.keys(clean).length > 0 ? clean : null
    }
    const updated = await prisma.staff.update({
      where: { id: body.id },
      data: { employmentByBranch: value ?? Prisma.DbNull },
      select: { id: true, employmentByBranch: true },
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
