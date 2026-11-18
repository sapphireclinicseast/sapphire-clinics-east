import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/** Branch-specific roles see their branch + Verdana Store */
function allowedBranches(role: string): string[] | null {
  if (role.startsWith('SBEA_') || role.startsWith('AHEA_')) return ['SBEA', 'VDNA']
  if (role.startsWith('SBGH_') || role.startsWith('AHGH_')) return ['SBGH', 'VDNA']
  return null // ADMIN / MARKETING_ADMIN — no restriction
}

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const role    = (session.user as { role?: string }).role ?? ''
  const allowed = allowedBranches(role)

  // ── Two shapes, and the lean one is the default ─────────────────────────
  //
  // This used to return prisma.staff.findMany() with no select at all — the
  // WHOLE row, to every caller: TIN, SSS, Pag-IBIG, PhilHealth, date of
  // birth, personal phone and email, bank account number. The Decking board
  // wanted a name and a department and was handed all of that.
  //
  // So the default is now the roster: what the boards actually draw with,
  // and nothing a payroll clerk would recognise. `?full=1` keeps the old
  // shape for the Staff Module, which genuinely displays those fields, and
  // stays branch-scoped exactly as it was — nobody loses access they had.
  //
  // The lean shape is also CROSS-BRANCH, which is the point. Front desk
  // coordinate patients across both clinics and could not read the other
  // branch's board at all: visibleBranches() in the Decking module has said
  // "everyone sees both boards" for a long time, but this endpoint quietly
  // returned an empty roster for the other one, so the board rendered blank
  // and looked broken rather than blocked. Editing is unchanged and still
  // enforced server-side by canWriteSlot.
  const full = new URL(req.url).searchParams.get('full') === '1'

  if (full) {
    const staff = await prisma.staff.findMany({
      where: allowed
        ? { active: true, OR: [{ branch: { in: allowed } }, { extraBranches: { hasSome: allowed } }] }
        : { active: true },
      orderBy: [{ lastName: 'asc' }, { firstName: 'asc' }],
    })
    return NextResponse.json(staff)
  }

  const staff = await prisma.staff.findMany({
    where: { active: true },
    select: {
      id: true, employeeId: true, firstName: true, lastName: true, sex: true,
      // Work contacts, kept. Two real features read them off this list: the
      // Clinic Schedule refuses to text a clinician with no number on file
      // (`!staff.phone`), and the admin page prefills a new login's address
      // from the staff record. Dropping them would have made the first
      // silently refuse every SMS.
      email: true, phone: true,
      department: true, branch: true, extraBranches: true,
      branchEmployment: true, employmentByBranch: true,
      // Month-granular intern window — lib/intern-window.ts gates the Decking
      // and Clinic Schedule rosters on these two.
      dateHired: true, contractExpiry: true,
      jobTitle: true, employmentType: true, workArrangement: true,
      isInternshipSupervisor: true, isClinicalMentor: true, menteeIds: true,
      active: true,
      // Deliberately absent: tin, sss, pagibig, philhealth, bankName,
      // bankAccountNo and dob — government identifiers, bank details and a
      // date of birth. None of them draw a board, and they are precisely the
      // fields that matter if a front-desk login is ever shared or phished.
    },
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
