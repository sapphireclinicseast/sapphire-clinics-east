import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

// Departments offered as tick-boxes. Mirrors the StaffDepartment enum.
const DEPARTMENTS = [
  'OT', 'PT', 'SLP', 'SPED', 'MD',
  'PSYCHOLOGY', 'ORTHOSIS', 'FRONT_DESK', 'ADMINISTRATION',
] as const

// Branch identifiers offered as tick-boxes (an entry may serve several).
const BRANCHES = ['EAST', 'GREENHILLS', 'VERDANA', 'CORPORATE'] as const

function isAdmin(role?: string) {
  return role === 'ADMIN'
}

// Map a staff branch code (Staff.branch) → directory branch identifier.
// Corporate has no physical staff branch, so only admins resolve to it.
function staffBranchToDirectory(code?: string): string | null {
  switch (code) {
    case 'SANDBOX_EAST':
    case 'SBEA':
      return 'EAST'
    case 'SANDBOX_GREENHILLS':
    case 'SBGH':
      return 'GREENHILLS'
    case 'VERDANA_STORE':
    case 'VERDANA':
      return 'VERDANA'
    default:
      return null
  }
}

// All directory branches a viewer belongs to (across interbranch records).
function viewerDirectoryBranches(user: {
  role?: string
  branch?: string
  branches?: { branch: string }[]
}): string[] {
  const set = new Set<string>()
  const add = (c?: string) => { const d = staffBranchToDirectory(c); if (d) set.add(d) }
  add(user.branch)
  ;(user.branches ?? []).forEach((b) => add(b.branch))
  // Admins are corporate-level and can see everything.
  if (isAdmin(user.role)) set.add('CORPORATE')
  return [...set]
}

function isValidEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)
}

// GET — list directory entries. Visible to every signed-in user.
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const admin = isAdmin(session.user.role)
  const viewerBranches = viewerDirectoryBranches(session.user)

  // @ts-ignore — directoryEntry not in PrismaClient typings until generate
  const rows = await prisma.directoryEntry.findMany({
    orderBy: { createdAt: 'asc' },
  })

  // Enforce per-entry email visibility SERVER-SIDE. A restricted email is
  // never sent to a viewer who isn't in an allowed branch (admins excepted).
  const entries = rows.map((e: any) => {
    const restricted = Array.isArray(e.visibleBranches) && e.visibleBranches.length > 0
    const allowed =
      admin || !restricted || e.visibleBranches.some((b: string) => viewerBranches.includes(b))
    return {
      id: e.id,
      departments: e.departments,
      branches: e.branches,
      description: e.description,
      restricted,
      // "Visible To" column is admin-only — don't send the list to others.
      visibleBranches: admin ? (Array.isArray(e.visibleBranches) ? e.visibleBranches : []) : undefined,
      // Mask the email entirely when the viewer isn't allowed to see it.
      email: allowed ? e.email : null,
      emailHidden: !allowed,
    }
  })

  return NextResponse.json({ entries, departments: DEPARTMENTS, branches: BRANCHES, isAdmin: admin })
}

// POST — create a directory entry (admin only).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const departments: string[] = Array.isArray(body.departments)
    ? body.departments.filter((d: unknown): d is string => typeof d === 'string' && (DEPARTMENTS as readonly string[]).includes(d))
    : []
  const branches: string[] = Array.isArray(body.branches)
    ? body.branches.filter((b: unknown): b is string => typeof b === 'string' && (BRANCHES as readonly string[]).includes(b))
    : []
  // Visibility allow-list (empty = visible to everyone).
  const visibleBranches: string[] = Array.isArray(body.visibleBranches)
    ? body.visibleBranches.filter((b: unknown): b is string => typeof b === 'string' && (BRANCHES as readonly string[]).includes(b))
    : []
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''

  if (departments.length === 0) {
    return NextResponse.json({ error: 'Select at least one department' }, { status: 400 })
  }
  if (branches.length === 0) {
    return NextResponse.json({ error: 'Select at least one branch' }, { status: 400 })
  }
  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })
  }

  // @ts-ignore
  const entry = await prisma.directoryEntry.create({
    data: {
      departments,
      branches,
      visibleBranches,
      email,
      description: description || null,
      createdById: session.user.id,
    },
  })
  return NextResponse.json({ entry }, { status: 201 })
}

// PUT — edit an existing directory entry (admin only).
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const body = await req.json()
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })

  const departments: string[] = Array.isArray(body.departments)
    ? body.departments.filter((d: unknown): d is string => typeof d === 'string' && (DEPARTMENTS as readonly string[]).includes(d))
    : []
  const branches: string[] = Array.isArray(body.branches)
    ? body.branches.filter((b: unknown): b is string => typeof b === 'string' && (BRANCHES as readonly string[]).includes(b))
    : []
  const visibleBranches: string[] = Array.isArray(body.visibleBranches)
    ? body.visibleBranches.filter((b: unknown): b is string => typeof b === 'string' && (BRANCHES as readonly string[]).includes(b))
    : []
  const email = typeof body.email === 'string' ? body.email.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''

  if (departments.length === 0) return NextResponse.json({ error: 'Select at least one department' }, { status: 400 })
  if (branches.length === 0) return NextResponse.json({ error: 'Select at least one branch' }, { status: 400 })
  if (!email || !isValidEmail(email)) return NextResponse.json({ error: 'A valid email is required' }, { status: 400 })

  // @ts-ignore
  const entry = await prisma.directoryEntry.update({
    where: { id },
    data: { departments, branches, visibleBranches, email, description: description || null },
  }).catch(() => null)
  if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 })
  return NextResponse.json({ entry })
}

// DELETE — remove a directory entry by id (admin only).
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }

  const id = req.nextUrl.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id is required' }, { status: 400 })
  }

  // @ts-ignore
  await prisma.directoryEntry.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ success: true })
}
