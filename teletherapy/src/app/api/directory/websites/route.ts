import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { prisma } from '@/lib/prisma'

const BRANCHES = ['EAST', 'GREENHILLS', 'VERDANA', 'CORPORATE'] as const

function isAdmin(role?: string) {
  return role === 'ADMIN'
}

// Map a staff branch code → directory branch identifier (same as emails).
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

function viewerDirectoryBranches(user: { role?: string; branch?: string; branches?: { branch: string }[] }): string[] {
  const set = new Set<string>()
  const add = (c?: string) => { const d = staffBranchToDirectory(c); if (d) set.add(d) }
  add(user.branch)
  ;(user.branches ?? []).forEach((b) => add(b.branch))
  if (isAdmin(user.role)) set.add('CORPORATE')
  return [...set]
}

// GET — websites, with per-entry link visibility enforced server-side.
export async function GET() {
  const session = await auth()
  if (!session?.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  const admin = isAdmin(session.user.role)
  const viewerBranches = viewerDirectoryBranches(session.user)

  // @ts-ignore — directoryWebsite not in typings until generate
  const rows = await prisma.directoryWebsite.findMany({ orderBy: { createdAt: 'asc' } })

  const websites = (rows as any[]).map((w) => {
    const restricted = Array.isArray(w.visibleBranches) && w.visibleBranches.length > 0
    const allowed = admin || !restricted || w.visibleBranches.some((b: string) => viewerBranches.includes(b))
    return {
      id: w.id,
      description: w.description,
      visibleBranches: Array.isArray(w.visibleBranches) ? w.visibleBranches : [],
      restricted,
      link: allowed ? w.link : null,
      linkHidden: !allowed,
    }
  })
  return NextResponse.json({ websites, branches: BRANCHES, isAdmin: admin })
}

function parseBody(body: any) {
  const link = typeof body.link === 'string' ? body.link.trim() : ''
  const description = typeof body.description === 'string' ? body.description.trim() : ''
  const visibleBranches: string[] = Array.isArray(body.visibleBranches)
    ? body.visibleBranches.filter((b: unknown): b is string => typeof b === 'string' && (BRANCHES as readonly string[]).includes(b))
    : []
  return { link, description, visibleBranches }
}

// POST — create a website (admin only).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const { link, description, visibleBranches } = parseBody(await req.json())
  if (!link) return NextResponse.json({ error: 'A link is required' }, { status: 400 })

  // @ts-ignore
  const website = await prisma.directoryWebsite.create({
    data: { link, description: description || null, visibleBranches, createdById: session.user.id },
  })
  return NextResponse.json({ website }, { status: 201 })
}

// PUT — edit a website (admin only).
export async function PUT(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const body = await req.json()
  const id = typeof body.id === 'string' ? body.id : ''
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  const { link, description, visibleBranches } = parseBody(body)
  if (!link) return NextResponse.json({ error: 'A link is required' }, { status: 400 })

  // @ts-ignore
  const website = await prisma.directoryWebsite.update({
    where: { id },
    data: { link, description: description || null, visibleBranches },
  }).catch(() => null)
  if (!website) return NextResponse.json({ error: 'Website not found' }, { status: 404 })
  return NextResponse.json({ website })
}

// DELETE — remove a website (admin only).
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user || !isAdmin(session.user.role)) {
    return NextResponse.json({ error: 'Admin access required' }, { status: 403 })
  }
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'id is required' }, { status: 400 })
  // @ts-ignore
  await prisma.directoryWebsite.delete({ where: { id } }).catch(() => null)
  return NextResponse.json({ success: true })
}
